"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

type Batch = {
  id: string;
  grupo: string | null;
  tipo_pago: string | null;
  estado: string;
  total_registros: number;
  monto_total: number;
  txt_file_name: string | null;
  created_at: string;
};

type Receipt = {
  id: string;
  numero_recibo: string | null;
  comprobante_file_name: string | null;
  comprobante_storage_path: string | null;
  recibo_storage_path: string | null;
  estado_pago: string | null;
};

export default function GeneradorRecibo() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<Batch | null>(null);
  const [recibo, setRecibo] = useState<Receipt | null>(null);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [estadoPago, setEstadoPago] = useState("confirmado");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("payment_batches")
      .select("id, grupo, tipo_pago, estado, total_registros, monto_total, txt_file_name, created_at")
      .neq("estado", "borrador")
      .order("created_at", { ascending: false });
    setBatches((data as Batch[]) ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function seleccionar(b: Batch) {
    setSel(b);
    setError("");
    setComprobante(null);
    const { data } = await supabase
      .from("receipts")
      .select("id, numero_recibo, comprobante_file_name, comprobante_storage_path, recibo_storage_path, estado_pago")
      .eq("batch_id", b.id)
      .maybeSingle();
    setRecibo((data as Receipt) ?? null);
    if (data?.estado_pago) setEstadoPago(data.estado_pago);
  }

  async function generar() {
    if (!sel) return;
    setTrabajando(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada. Inicia sesión de nuevo.");

      // Nombre del usuario
      const { data: perfil } = await supabase.from("profiles").select("nombre, correo").eq("id", user.id).single();
      const usuario = perfil?.nombre || perfil?.correo || "Usuario";

      // 1) Subir comprobante (si se adjuntó uno nuevo)
      let compName = recibo?.comprobante_file_name ?? null;
      let compPath = recibo?.comprobante_storage_path ?? null;
      if (comprobante) {
        const ext = comprobante.name.split(".").pop() || "pdf";
        compPath = `${user.id}/${sel.id}_comprobante.${ext}`;
        const { error: eUp } = await supabase.storage.from("comprobantes").upload(compPath, comprobante, { upsert: true });
        if (eUp) throw new Error("No se pudo subir el comprobante: " + eUp.message);
        compName = comprobante.name;
      }

      // 2) Número de recibo (si aún no tiene)
      let numero = recibo?.numero_recibo ?? null;
      if (!numero) {
        const { count } = await supabase.from("receipts").select("id", { count: "exact", head: true });
        const anio = new Date().getFullYear();
        numero = `REC-${anio}-${String((count ?? 0) + 1).padStart(4, "0")}`;
      }

      const ahora = new Date();

      // 3) Construir el HTML del recibo y subirlo al bucket "recibos"
      const html = reciboHtml({
        numero,
        fecha: ahora.toLocaleDateString("es-DO"),
        hora: ahora.toLocaleTimeString("es-DO"),
        grupo: sel.grupo || "—",
        tipo: sel.tipo_pago || "—",
        monto: money(Number(sel.monto_total)),
        cantidad: sel.total_registros,
        txt: sel.txt_file_name || "—",
        comprobante: compName || "—",
        estadoPago,
        usuario,
      });
      const reciboPath = `${user.id}/${sel.id}_recibo.html`;
      await supabase.storage.from("recibos").upload(reciboPath, new Blob([html], { type: "text/html" }), { upsert: true });

      // 4) Guardar/actualizar el recibo en la BD
      const registro = {
        batch_id: sel.id,
        user_id: user.id,
        numero_recibo: numero,
        comprobante_file_name: compName,
        comprobante_storage_path: compPath,
        recibo_file_name: `${numero}.html`,
        recibo_storage_path: reciboPath,
        estado_pago: estadoPago,
      };
      if (recibo?.id) {
        await supabase.from("receipts").update(registro).eq("id", recibo.id);
      } else {
        await supabase.from("receipts").insert(registro);
      }

      // 5) Marcar el proceso como completado
      await supabase.from("payment_batches").update({ estado: "completado" }).eq("id", sel.id);

      // 6) Abrir el recibo para imprimir/guardar PDF
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }

      await seleccionar(sel);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Módulo 4</span>
        <h1 className="text-2xl font-bold text-slate-800">Recibo de Pago</h1>
        <p className="text-slate-500">Adjunta el comprobante del banco y genera el recibo.</p>
      </div>

      {!sel ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Elige un proceso con TXT generado</div>
          {cargando ? (
            <p className="px-5 py-10 text-center text-slate-400">Cargando…</p>
          ) : batches.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-400">Aún no hay procesos con TXT generado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {batches.map((b) => (
                <li key={b.id}>
                  <button onClick={() => seleccionar(b)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{b.grupo || "Proceso"}</p>
                      <p className="text-xs text-slate-500">{new Date(b.created_at).toLocaleString("es-DO")} · {b.total_registros} pagos · {money(Number(b.monto_total))}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">{b.estado.replace("_", " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <button onClick={() => setSel(null)} className="text-sm font-medium text-slate-500 hover:text-slate-800">← Volver a la lista</button>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dato titulo="Grupo" valor={sel.grupo || "—"} />
              <Dato titulo="Pagos" valor={String(sel.total_registros)} />
              <Dato titulo="Monto total" valor={money(Number(sel.monto_total))} />
              <Dato titulo="Tipo" valor={sel.tipo_pago || "—"} />
            </div>

            {recibo?.numero_recibo && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                Este proceso ya tiene el recibo <b>{recibo.numero_recibo}</b>. Puedes regenerarlo o actualizar el comprobante.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Comprobante del banco (PDF o imagen)</label>
                <input type="file" accept=".pdf,image/*" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100" />
                {recibo?.comprobante_file_name && !comprobante && (
                  <p className="mt-1 text-xs text-slate-500">Actual: {recibo.comprobante_file_name}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Estado del pago</label>
                <select value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="confirmado">Confirmado</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="mt-5 flex justify-end">
              <button onClick={generar} disabled={trabajando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {trabajando ? "Generando…" : recibo?.numero_recibo ? "Actualizar y ver recibo" : "Generar recibo"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="font-semibold capitalize text-slate-800">{valor}</p>
    </div>
  );
}

function reciboHtml(d: {
  numero: string; fecha: string; hora: string; grupo: string; tipo: string;
  monto: string; cantidad: number; txt: string; comprobante: string;
  estadoPago: string; usuario: string;
}) {
  const fila = (k: string, v: string) =>
    `<tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #eef2f7">${k}</td><td style="padding:8px 12px;color:#0f172a;font-weight:600;border-bottom:1px solid #eef2f7;text-align:right">${v}</td></tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${d.numero}</title>
<style>@media print{.noprint{display:none}} body{font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:24px}</style></head>
<body>
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(2,6,23,.08)">
  <div style="background:#2563eb;color:#fff;padding:24px 28px">
    <div style="font-size:13px;opacity:.85">UD GROUP DOMINICANA</div>
    <div style="font-size:22px;font-weight:700">Recibo de Pago</div>
  </div>
  <div style="padding:20px 28px">
    <div style="display:flex;justify-content:space-between;margin-bottom:16px">
      <div><div style="color:#64748b;font-size:12px">No. de Recibo</div><div style="font-weight:700;color:#0f172a">${d.numero}</div></div>
      <div style="text-align:right"><div style="color:#64748b;font-size:12px">Fecha y hora</div><div style="font-weight:600;color:#0f172a">${d.fecha} ${d.hora}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${fila("Grupo", d.grupo)}
      ${fila("Tipo de pago", d.tipo)}
      ${fila("Cantidad de pagos", String(d.cantidad))}
      ${fila("Monto total pagado", d.monto)}
      ${fila("Archivo TXT", d.txt)}
      ${fila("Comprobante del banco", d.comprobante)}
      ${fila("Estado del pago", d.estadoPago)}
      ${fila("Procesado por", d.usuario)}
    </table>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px">Documento generado automáticamente por el sistema de Pagos Masivos.</p>
  </div>
</div>
<div class="noprint" style="max-width:640px;margin:16px auto;text-align:center">
  <button onclick="window.print()" style="background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer">Imprimir / Guardar PDF</button>
</div>
</body></html>`;
}
