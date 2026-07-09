import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtFecha } from "@/lib/fecha";

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Métricas (aún sin datos: mostrarán 0 hasta que se generen pagos)
  const { data: batches } = await supabase
    .from("payment_batches")
    .select("id, monto_total, total_registros, total_beneficiarios, estado, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: totalTxt } = await supabase
    .from("payment_batches")
    .select("id", { count: "exact", head: true })
    .not("txt_generated_at", "is", null);

  const totalPagado =
    batches?.reduce((s, b) => s + Number(b.monto_total ?? 0), 0) ?? 0;
  const totalRegistros =
    batches?.reduce((s, b) => s + Number(b.total_registros ?? 0), 0) ?? 0;

  const stats = [
    { label: "Total pagado", value: formatMoney(totalPagado), color: "bg-blue-600" },
    { label: "Pagos procesados", value: totalRegistros.toLocaleString("es-DO"), color: "bg-emerald-600" },
    { label: "Archivos TXT generados", value: (totalTxt ?? 0).toLocaleString("es-DO"), color: "bg-violet-600" },
    { label: "Procesos registrados", value: (batches?.length ?? 0).toLocaleString("es-DO"), color: "bg-amber-600" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500">Resumen de la actividad de pagos.</p>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
            <div className={`mb-3 h-10 w-10 rounded-xl ${s.color}`} />
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Acceso rápido */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Acciones rápidas</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/dashboard/solicitudes" className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100 transition hover:border-blue-300 hover:shadow-md">
            <p className="font-semibold text-slate-800">1 · Cargar solicitud</p>
            <p className="text-sm text-slate-500">Importar el Excel de pagos.</p>
          </Link>
          <Link href="/dashboard/generar" className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100 transition hover:border-blue-300 hover:shadow-md">
            <p className="font-semibold text-slate-800">2 · Generar TXT</p>
            <p className="text-sm text-slate-500">Validar y crear el archivo del banco.</p>
          </Link>
          <Link href="/dashboard/recibos" className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100 transition hover:border-blue-300 hover:shadow-md">
            <p className="font-semibold text-slate-800">3 · Recibo de pago</p>
            <p className="text-sm text-slate-500">Adjuntar comprobante y generar recibo.</p>
          </Link>
        </div>
      </div>

      {/* Últimos procesos */}
      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Últimos pagos</h2>
        </div>
        {batches && batches.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Fecha</th>
                <th className="px-5 py-3 text-left font-medium">Registros</th>
                <th className="px-5 py-3 text-left font-medium">Monto</th>
                <th className="px-5 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 text-slate-700">{fmtFecha(b.created_at)}</td>
                  <td className="px-5 py-3 text-slate-700">{b.total_registros}</td>
                  <td className="px-5 py-3 text-slate-700">{formatMoney(Number(b.monto_total ?? 0))}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">{b.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-12 text-center text-slate-400">
            <p>Aún no hay pagos registrados.</p>
            <Link href="/dashboard/solicitudes" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
              Cargar la primera solicitud →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
