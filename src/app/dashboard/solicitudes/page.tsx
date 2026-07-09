import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, esViewer, type Estado, type Rol } from "@/lib/auth/roles";
import { fmtFecha } from "@/lib/fecha";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user?.id ?? "")
    .single();
  const rol = (perfil?.rol ?? "usuario") as Rol;
  const soloVer = esViewer(rol);

  const { data: batches } = await supabase
    .from("payment_batches")
    .select("id, numero_solicitud, grupo, contrato, estado, total_registros, monto_total, created_at, published_at, motivo_devolucion")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {soloVer ? "Visor" : "Contratos"}
          </span>
          <h1 className="text-2xl font-bold text-slate-800">Solicitudes de Pago</h1>
          <p className="text-slate-500">
            {soloVer ? "Visualiza el estado de todas las solicitudes." : "Crea, edita y publica tus solicitudes para Contabilidad."}
          </p>
        </div>
        {!soloVer && (
          <Link href="/dashboard/solicitudes/nueva" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Nueva solicitud
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">No.</th>
              <th className="px-4 py-3 text-left font-medium">Grupo · Contrato</th>
              <th className="px-4 py-3 text-left font-medium">Fecha</th>
              <th className="px-4 py-3 text-right font-medium">Pagos</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!batches || batches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <p className="text-slate-400">No hay solicitudes aún.</p>
                  {!soloVer && (
                    <Link href="/dashboard/solicitudes/nueva" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                      Crear la primera →
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              batches.map((b) => {
                const est = ETIQUETA_ESTADO[b.estado as Estado] ?? { texto: b.estado, clase: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{b.numero_solicitud ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-medium text-slate-800">{b.grupo || "—"}</div>
                      {b.contrato && <div className="text-xs text-slate-500">{b.contrato}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtFecha(b.created_at)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{b.total_registros}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{money(Number(b.monto_total))}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2.5 py-1 text-xs " + est.clase}>{est.texto}</span></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/solicitudes/${b.id}`} className="text-sm font-medium text-blue-600 hover:underline">Ver</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
