import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ETIQUETA_ESTADO,
  puedePublicar,
  puedeGestionar,
  esContratos,
  type Estado,
  type Rol,
} from "@/lib/auth/roles";
import { fmtFechaHora } from "@/lib/fecha";
import BotonesFlujo from "./BotonesFlujo";
import GeneradorReciboInline from "./GeneradorReciboInline";
import BotonImprimir from "./BotonImprimir";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const ACCION_LABEL: Record<string, { texto: string; color: string; icono: string }> = {
  crear:        { texto: "Solicitud creada",     color: "bg-slate-200 text-slate-700", icono: "＋" },
  publicar:     { texto: "Publicada",            color: "bg-amber-200 text-amber-800", icono: "↑" },
  revisar:      { texto: "En revisión",          color: "bg-sky-200 text-sky-800",     icono: "◎" },
  devolver:     { texto: "Devuelta",             color: "bg-red-200 text-red-800",     icono: "↩" },
  generar_txt:  { texto: "TXT generado",         color: "bg-violet-200 text-violet-800", icono: "⬇" },
  pagar:        { texto: "Pagada",               color: "bg-emerald-200 text-emerald-800", icono: "✓" },
  cancelar:     { texto: "Cancelada",            color: "bg-slate-300 text-slate-800", icono: "✕" },
};

export default async function DetalleSolicitud({
  batchId,
  volverHref,
  contexto,
}: {
  batchId: string;
  volverHref: string;
  contexto: "contratos" | "contabilidad";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user!.id)
    .single();
  const rol = (perfil?.rol ?? "usuario") as Rol;

  const { data: b } = await supabase
    .from("payment_batches")
    .select(
      "id, numero_solicitud, grupo, contrato, encargado, solicitado_por, tipo_pago, estado, total_registros, total_beneficiarios, monto_total, motivo_devolucion, excel_file_name, excel_storage_path, txt_file_name, txt_storage_path, created_at, published_at, reviewed_at, user_id, conceptos_pagar, profiles:profiles!payment_batches_user_id_fkey(nombre, correo)"
    )
    .eq("id", batchId)
    .single();

  if (!b) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        Solicitud no encontrada.
      </div>
    );
  }

  const { data: pagos } = await supabase
    .from("payments")
    .select("fila, beneficiario, cedula_rnc, banco_destino, cuenta_banco, tipo_cuenta, monto, concepto, tiene_error, errores, estado_pago")
    .eq("batch_id", batchId)
    .order("fila", { ascending: true });

  const { data: eventos } = await supabase
    .from("audit_log")
    .select("id, accion, descripcion, user_nombre, user_rol, meta, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  const estado = b.estado as Estado;
  const est = ETIQUETA_ESTADO[estado] ?? { texto: estado, clase: "bg-slate-100" };
  const soyDueno = b.user_id === user!.id;
  const perfilDueno = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
  const nombreDueno = (perfilDueno as { nombre?: string; correo?: string } | null)?.nombre
                    || (perfilDueno as { nombre?: string; correo?: string } | null)?.correo
                    || "—";

  const mostrarPublicar    = puedePublicar(rol, estado, soyDueno);
  const mostrarGestionar   = puedeGestionar(rol, estado);
  const mostrarCancelar    = esContratos(rol) || (soyDueno && estado === "borrador");

  return (
    <div className="space-y-5">
      <div>
        <Link href={volverHref} className="text-sm font-medium text-slate-500 hover:text-slate-800">← Volver</Link>
      </div>

      {/* Encabezado */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{contexto === "contratos" ? "Contratos" : "Contabilidad"}</p>
            <h1 className="text-2xl font-bold text-slate-800">{b.numero_solicitud ?? "Solicitud"}</h1>
            <p className="text-slate-600">
              {b.grupo || "—"}
              {b.contrato ? ` · ${b.contrato}` : ""}
            </p>
          </div>
          <span className={"rounded-full px-3 py-1 text-sm font-medium " + est.clase}>{est.texto}</span>
        </div>

        {estado === "devuelta" && b.motivo_devolucion && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">Motivo de la devolución</p>
            <p className="mt-1 text-sm text-red-700">{b.motivo_devolucion}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato titulo="Pagos" valor={String(b.total_registros)} />
          <Dato titulo="Beneficiarios" valor={String(b.total_beneficiarios)} />
          <Dato titulo="Monto total" valor={money(Number(b.monto_total))} />
          <Dato titulo="Encargado" valor={b.encargado || "—"} />
          <Dato titulo="Solicitado por" valor={b.solicitado_por || "—"} />
          <Dato titulo="Creada por" valor={nombreDueno} />
          <Dato titulo="Creada" valor={fmtFechaHora(b.created_at)} />
          <Dato titulo="Publicada" valor={fmtFechaHora(b.published_at)} />
        </div>

        {Array.isArray(b.conceptos_pagar) && (b.conceptos_pagar as string[]).length > 0 && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="mb-2 text-sm font-semibold text-blue-800">Pagar:</p>
            <ul className="space-y-1">
              {(b.conceptos_pagar as string[]).map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm text-blue-700">
                  <span className="text-blue-500">•</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <BotonesFlujo
            batchId={b.id}
            estado={estado}
            mostrarPublicar={mostrarPublicar}
            mostrarGestionar={mostrarGestionar}
            mostrarCancelar={mostrarCancelar}
            contexto={contexto}
            txtStoragePath={b.txt_storage_path}
            grupo={b.grupo}
            tipoPago={b.tipo_pago}
          />
          {contexto === "contabilidad" && <BotonImprimir />}
        </div>
      </div>

      {/* Beneficiarios */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-800">Beneficiarios</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Beneficiario</th>
                <th className="px-3 py-2 text-left font-medium">Cédula/RNC</th>
                <th className="px-3 py-2 text-left font-medium">Banco</th>
                <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                {contexto === "contabilidad" && (
                  <th className="px-3 py-2 text-center font-medium">Estado</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(pagos ?? []).map((p) => (
                <tr key={p.fila} className={"border-t border-slate-100 " + (p.tiene_error ? "bg-red-50" : "")}>
                  <td className="px-3 py-2 text-slate-400">{p.fila}</td>
                  <td className="px-3 py-2 capitalize text-slate-800">{p.beneficiario || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.cedula_rnc || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.banco_destino || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.cuenta_banco || "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{p.tipo_cuenta || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{(p as { concepto?: string }).concepto || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{money(Number(p.monto))}</td>
                  {contexto === "contabilidad" && (
                    <td className="px-3 py-2 text-center">
                      {(p as { estado_pago?: string }).estado_pago === "pagado" ? (
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Pagado</span>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Módulo de recibos — siempre visible */}
      <GeneradorReciboInline
        batchId={b.id}
        grupo={b.grupo}
        tipoPago={b.tipo_pago}
        tieneTxt={!!b.txt_file_name}
      />

      {/* Auditoría */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-800">Historial de auditoría</h2>
        {!eventos || eventos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin eventos.</p>
        ) : (
          <ol className="space-y-3">
            {eventos.map((e) => {
              const meta = ACCION_LABEL[e.accion] ?? { texto: e.accion, color: "bg-slate-200 text-slate-700", icono: "•" };
              const motivo = (e.meta as { motivo?: string } | null)?.motivo;
              return (
                <li key={e.id} className="flex gap-3">
                  <span className={"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold " + meta.color}>{meta.icono}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{meta.texto}</p>
                    <p className="text-xs text-slate-500">
                      {e.user_nombre || "—"}
                      {e.user_rol ? ` · ${e.user_rol}` : ""}
                      {" · "}
                      {fmtFechaHora(e.created_at)}
                    </p>
                    {motivo && <p className="mt-1 text-xs text-red-600">Motivo: {motivo}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="font-semibold text-slate-800">{valor}</p>
    </div>
  );
}
