import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, type Estado } from "@/lib/auth/roles";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

export default async function Page() {
  const supabase = await createClient();

  // Solicitudes en flujo activo (excluye borradores privadas de contratos y pagadas/canceladas)
  const { data: batches } = await supabase
    .from("payment_batches")
    .select(
      "id, numero_solicitud, grupo, contrato, estado, total_registros, monto_total, created_at, published_at, motivo_devolucion, profiles:profiles!payment_batches_user_id_fkey(nombre, correo)"
    )
    .in("estado", ["publicada", "en_revision", "devuelta", "txt_generado"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const pendientes  = (batches ?? []).filter((b) => b.estado === "publicada");
  const enRevision  = (batches ?? []).filter((b) => b.estado === "en_revision");
  const devueltas   = (batches ?? []).filter((b) => b.estado === "devuelta");
  const conTxt      = (batches ?? []).filter((b) => b.estado === "txt_generado");

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Contabilidad</span>
        <h1 className="text-2xl font-bold text-slate-800">Solicitudes por gestionar</h1>
        <p className="text-slate-500">Revisa, genera el TXT y marca como pagada.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta titulo="Pendientes" valor={String(pendientes.length)} color="bg-amber-500" />
        <Tarjeta titulo="En revisión" valor={String(enRevision.length)} color="bg-sky-500" />
        <Tarjeta titulo="Devueltas" valor={String(devueltas.length)} color="bg-red-500" />
        <Tarjeta titulo="Con TXT" valor={String(conTxt.length)} color="bg-violet-500" />
      </div>

      <ListaBatches
        titulo="Pendientes de Contabilidad"
        vacio="No hay solicitudes por revisar."
        batches={pendientes}
      />
      {enRevision.length > 0 && (
        <ListaBatches titulo="En revisión" vacio="" batches={enRevision} />
      )}
      {devueltas.length > 0 && (
        <ListaBatches titulo="Devueltas para corrección" vacio="" batches={devueltas} />
      )}
      {conTxt.length > 0 && (
        <ListaBatches titulo="Con TXT generado (por pagar)" vacio="" batches={conTxt} />
      )}
    </div>
  );
}

type Batch = {
  id: string;
  numero_solicitud: string | null;
  grupo: string | null;
  contrato: string | null;
  estado: string;
  total_registros: number;
  monto_total: number;
  created_at: string;
  published_at: string | null;
  profiles: { nombre: string | null; correo: string | null } | { nombre: string | null; correo: string | null }[] | null;
};

function ListaBatches({ titulo, vacio, batches }: { titulo: string; vacio: string; batches: Batch[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-800">{titulo}</h2>
      </div>
      {batches.length === 0 ? (
        <p className="px-5 py-10 text-center text-slate-400">{vacio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {batches.map((b) => {
            const est = ETIQUETA_ESTADO[b.estado as Estado] ?? { texto: b.estado, clase: "bg-slate-100" };
            const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
            const nombre = p?.nombre || p?.correo || "—";
            return (
              <li key={b.id}>
                <Link href={`/dashboard/contabilidad/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-800">{b.numero_solicitud ?? "—"} · {b.grupo || "—"}</p>
                    <p className="text-xs text-slate-500">
                      {b.contrato ? `${b.contrato} · ` : ""}
                      Creada por {nombre} · {new Date(b.published_at ?? b.created_at).toLocaleDateString("es-DO")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">{b.total_registros} pagos</span>
                    <span className="text-sm font-semibold text-slate-800">{money(Number(b.monto_total))}</span>
                    <span className={"rounded-full px-2.5 py-1 text-xs " + est.clase}>{est.texto}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className={"mb-2 h-8 w-8 rounded-lg " + color} />
      <p className="text-xl font-bold text-slate-800">{valor}</p>
      <p className="text-xs text-slate-500">{titulo}</p>
    </div>
  );
}
