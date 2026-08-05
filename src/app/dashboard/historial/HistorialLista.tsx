"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtFechaHoraCorta } from "@/lib/fecha";
import { descargarConNombre } from "@/lib/descargarArchivo";
import { ETIQUETA_ESTADO, type Estado } from "@/lib/auth/roles";

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

// Estados reales usados hoy en la plataforma (se excluyen los valores legacy
// como "pagado"/"completado"/"anulado" que ya no se generan, para no
// duplicar opciones en el filtro).
const ESTADOS_FILTRO: Estado[] = ["borrador", "publicada", "en_revision", "devuelta", "txt_generado", "pagada", "cancelada"];

export default function HistorialLista() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);

  const [busca, setBusca] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [orden, setOrden] = useState<{ campo: "fecha" | "grupo" | "monto"; dir: "asc" | "desc" }>({
    campo: "fecha",
    dir: "desc",
  });

  const [errorCarga, setErrorCarga] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    const { data, error } = await supabase
      .from("payment_batches")
      .select(
        "id, grupo, excel_file_name, excel_storage_path, txt_file_name, txt_storage_path, tipo_pago, estado, total_registros, monto_total, created_at, profiles:profiles!payment_batches_user_id_fkey(nombre, correo), receipts(numero_recibo, comprobante_file_name, comprobante_storage_path, recibo_file_name, recibo_storage_path, estado_pago)",
      )
      .order("created_at", { ascending: false });
    if (error) setErrorCarga(error.message);
    setBatches((data as unknown as Batch[]) ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function descargar(bucket: string, path: string | null | undefined, nombre?: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) {
      alert("No se pudo generar el enlace de descarga.");
      return;
    }
    if (nombre) await descargarConNombre(data.signedUrl, nombre);
    else window.open(data.signedUrl, "_blank");
  }

  const filtrados = useMemo(() => {
    let lista = batches.filter((b) => {
      const texto = `${b.grupo ?? ""} ${b.excel_file_name ?? ""} ${b.profiles?.nombre ?? ""} ${b.profiles?.correo ?? ""}`.toLowerCase();
      if (busca && !texto.includes(busca.toLowerCase())) return false;
      if (fEstado && b.estado !== fEstado) return false;
      if (fTipo && b.tipo_pago !== fTipo) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      let cmp = 0;
      if (orden.campo === "fecha") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (orden.campo === "monto") cmp = Number(a.monto_total) - Number(b.monto_total);
      else cmp = (a.grupo ?? "").localeCompare(b.grupo ?? "");
      return orden.dir === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [batches, busca, fEstado, fTipo, orden]);

  const hayFiltrosActivos = busca !== "" || fEstado !== "" || fTipo !== "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Historial</h1>
        <p className="text-slate-500">Todos los procesos: solicitud, TXT, comprobante y recibo.</p>
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar el historial: {errorCarga}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
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
          {ESTADOS_FILTRO.map((k) => (
            <option key={k} value={k}>{ETIQUETA_ESTADO[k].texto}</option>
          ))}
        </select>
        <select
          value={`${orden.campo}_${orden.dir}`}
          onChange={(e) => {
            const [campo, dir] = e.target.value.split("_") as ["fecha" | "grupo" | "monto", "asc" | "desc"];
            setOrden({ campo, dir });
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="fecha_desc">Más recientes primero</option>
          <option value="fecha_asc">Más antiguos primero</option>
          <option value="grupo_asc">Nombre A-Z</option>
          <option value="grupo_desc">Nombre Z-A</option>
          <option value="monto_desc">Monto mayor a menor</option>
          <option value="monto_asc">Monto menor a mayor</option>
        </select>
        {hayFiltrosActivos && (
          <button
            onClick={() => { setBusca(""); setFEstado(""); setFTipo(""); }}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Limpiar filtros
          </button>
        )}
        <button onClick={cargar} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Actualizar</button>
        <span className="ml-auto text-xs text-slate-400">{filtrados.length} de {batches.length} procesos</span>
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
                const est = ETIQUETA_ESTADO[b.estado as Estado] ?? { texto: b.estado, clase: "bg-slate-100 text-slate-600" };
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
                        <Chip activo={!!b.txt_storage_path} onClick={() => descargar("txt-generados", b.txt_storage_path, b.txt_file_name)}>TXT</Chip>
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
