"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtFechaHoraCorta } from "@/lib/fecha";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

type Receipt = {
  numero_recibo: string | null;
  comprobante_file_name: string | null;
  comprobante_storage_path: string | null;
  recibo_file_name: string | null;
  recibo_storage_path: string | null;
  estado_pago: string | null;
};

type Batch = {
  id: string;
  grupo: string | null;
  excel_file_name: string | null;
  excel_storage_path: string | null;
  txt_file_name: string | null;
  txt_storage_path: string | null;
  tipo_pago: string | null;
  estado: string;
  total_registros: number;
  monto_total: number;
  created_at: string;
  profiles: { nombre: string | null; correo: string | null } | null;
  receipts: Receipt[] | null;
};

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-slate-100 text-slate-600" },
  txt_generado: { texto: "TXT generado", clase: "bg-violet-100 text-violet-700" },
  pagado: { texto: "Pagado", clase: "bg-amber-100 text-amber-700" },
  completado: { texto: "Completado", clase: "bg-emerald-100 text-emerald-700" },
  anulado: { texto: "Anulado", clase: "bg-red-100 text-red-700" },
};

export default function HistorialLista() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);

  const [busca, setBusca] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("payment_batches")
      .select(
        "id, grupo, excel_file_name, excel_storage_path, txt_file_name, txt_storage_path, tipo_pago, estado, total_registros, monto_total, created_at, profiles(nombre, correo), receipts(numero_recibo, comprobante_file_name, comprobante_storage_path, recibo_file_name, recibo_storage_path, estado_pago)",
      )
      .order("created_at", { ascending: false });
    setBatches((data as unknown as Batch[]) ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function descargar(bucket: string, path: string | null | undefined) {
    if (!path) return;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) {
      alert("No se pudo generar el enlace de descarga.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  const filtrados = batches.filter((b) => {
    const texto = `${b.grupo ?? ""} ${b.excel_file_name ?? ""} ${b.profiles?.nombre ?? ""} ${b.profiles?.correo ?? ""}`.toLowerCase();
    if (busca && !texto.includes(busca.toLowerCase())) return false;
    if (fEstado && b.estado !== fEstado) return false;
    if (fTipo && b.tipo_pago !== fTipo) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Historial</h1>
        <p className="text-slate-500">Todos los procesos: solicitud, TXT, comprobante y recibo.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por grupo, usuario o archivo…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          <option value="terceros">Terceros</option>
          <option value="interbancaria">Interbancaria</option>
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>{v.texto}</option>
          ))}
        </select>
        <button onClick={cargar} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Actualizar</button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Fecha</th>
              <th className="px-4 py-3 text-left font-medium">Grupo</th>
              <th className="px-4 py-3 text-left font-medium">Usuario</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-right font-medium">Pagos</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
              <th className="px-4 py-3 text-left font-medium">Archivos</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Sin resultados.</td></tr>
            ) : (
              filtrados.map((b) => {
                const rec = b.receipts?.[0];
                const est = ESTADOS[b.estado] ?? { texto: b.estado, clase: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtFechaHoraCorta(b.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{b.grupo || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{b.profiles?.nombre || b.profiles?.correo || "—"}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{b.tipo_pago || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{b.total_registros}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{money(Number(b.monto_total))}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2.5 py-1 text-xs " + est.clase}>{est.texto}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Chip activo={!!b.excel_storage_path} onClick={() => descargar("excel-solicitudes", b.excel_storage_path)}>Excel</Chip>
                        <Chip activo={!!b.txt_storage_path} onClick={() => descargar("txt-generados", b.txt_storage_path)}>TXT</Chip>
                        <Chip activo={!!rec?.comprobante_storage_path} onClick={() => descargar("comprobantes", rec?.comprobante_storage_path)}>Comprob.</Chip>
                        <Chip activo={!!rec?.recibo_storage_path} onClick={() => descargar("recibos", rec?.recibo_storage_path)}>Recibo</Chip>
                      </div>
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

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  if (!activo) {
    return <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-300">{children}</span>;
  }
  return (
    <button onClick={onClick} className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">
      ⬇ {children}
    </button>
  );
}
