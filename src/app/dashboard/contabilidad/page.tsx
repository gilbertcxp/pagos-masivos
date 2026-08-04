import { createClient } from "@/lib/supabase/server";
import ListaSolicitudes, { type Batch } from "./ListaSolicitudes";

export default async function Page() {
  const supabase = await createClient();

  // Solicitudes en flujo activo (excluye borradores privadas de contratos y pagadas/canceladas)
  const { data: batches } = await supabase
    .from("payment_batches")
    .select(
      "id, numero_solicitud, grupo, contrato, estado, total_registros, monto_total, created_at, published_at, motivo_devolucion, conceptos_pagar, profiles:profiles!payment_batches_user_id_fkey(nombre, correo)"
    )
    .in("estado", ["publicada", "en_revision", "devuelta", "txt_generado"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  // Pagadas recientes (para poder revertir a pendiente si se marcó por error)
  const { data: pagadasData } = await supabase
    .from("payment_batches")
    .select(
      "id, numero_solicitud, grupo, contrato, estado, total_registros, monto_total, created_at, published_at, motivo_devolucion, conceptos_pagar, profiles:profiles!payment_batches_user_id_fkey(nombre, correo)"
    )
    .eq("estado", "pagada")
    .order("created_at", { ascending: false })
    .limit(20);

  const pendientes  = (batches ?? []).filter((b) => b.estado === "publicada") as Batch[];
  const enRevision  = (batches ?? []).filter((b) => b.estado === "en_revision") as Batch[];
  const devueltas   = (batches ?? []).filter((b) => b.estado === "devuelta") as Batch[];
  const conTxt      = (batches ?? []).filter((b) => b.estado === "txt_generado") as Batch[];
  const pagadas     = (pagadasData ?? []) as Batch[];

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

      <ListaSolicitudes
        pendientes={pendientes}
        enRevision={enRevision}
        devueltas={devueltas}
        conTxt={conTxt}
        pagadas={pagadas}
      />
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
