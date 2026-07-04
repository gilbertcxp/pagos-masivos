import DetalleSolicitud from "@/app/dashboard/_components/DetalleSolicitud";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DetalleSolicitud
      batchId={id}
      volverHref="/dashboard/solicitudes"
      contexto="contratos"
    />
  );
}
