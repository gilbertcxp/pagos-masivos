import DetalleSolicitud from "@/app/dashboard/_components/DetalleSolicitud";
import { createClient } from "@/lib/supabase/server";
import { iniciarRevision } from "@/app/dashboard/_actions/flujo";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Si está publicada, automáticamente la pasamos a "en revisión" al abrir
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("payment_batches")
    .select("estado")
    .eq("id", id)
    .single();
  if (b?.estado === "publicada") {
    try { await iniciarRevision(id); } catch {}
  }

  return (
    <DetalleSolicitud
      batchId={id}
      volverHref="/dashboard/contabilidad"
      contexto="contabilidad"
    />
  );
}
