"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { construirZipRecibos, type PagoRecibo, type MetaRecibo } from "@/lib/recibo/generarRecibos";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const slug = (s: string) =>
  (s || "grupo").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

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
  const [ok, setOk] = useState("");

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
    setOk("");
    setComprobante(null);
    const { data } = await supabase
      .from("receipts")
      .select("id, numero_recibo, comprobante_file_name, recibo_storage_path, estado_pago")
      .eq("batch_id", b.id)
      .maybeSingle();
    setRecibo((data as Receipt) ?? null);
    if (data?.estado_pago) setEstadoPago(data.estado_pago);
  }

  function descargarZip(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.download = `Recibos_${slug(sel?.grupo ?? "grupo")}_${fecha}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function generar() {
    if (!sel) return;
    setTrabajando(true);
    setError("");
    setOk("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada. Inicia sesión de nuevo.");

      const { data: perfil } = await supabase.from("profiles").select("nombre, correo").eq("id", user.id).single();
      const usuario = perfil?.nombre || perfil?.correo || "Usuario";

      // Cargar los pagos del proceso
      const { data: pays } = await supabase
        .from("payments")
        .select("beneficiario, cedula_rnc, cuenta_banco, banco_destino, tipo_cuenta, monto, concepto")
        .eq("batch_id", sel.id)
        .order("fila", { ascending: true });
      const pagos: PagoRecibo[] = (pays ?? []).map((p) => ({
        beneficiario: p.beneficiario ?? "",
        cedula: p.cedula_rnc ?? "",
        banco: p.banco_destino ?? "",
        cuenta: p.cuenta_banco ?? "",
        tipoCuenta: p.tipo_cuenta ?? "",
        monto: Number(p.monto ?? 0),
        concepto: p.concepto ?? "",
      }));
      if (pagos.length === 0) throw new Error("Este proceso no tiene pagos.");

      // Subir el comprobante (si se adjuntó uno nuevo)
      let compName = recibo?.comprobante_file_name ?? null;
      let compPath: string | null = null;
      if (comprobante) {
        const ext = comprobante.name.split(".").pop() || "pdf";
        compPath = `${user.id}/${sel.id}_comprobante.${ext}`;
        const { error: eUp } = await supabase.storage.from("comprobantes").upload(compPath, comprobante, { upsert: true });
        if (eUp) throw new Error("No se pudo subir el comprobante: " + eUp.message);
        compName = comprobante.name;
      }

      // Número base de recibo
      let base = recibo?.numero_recibo ?? null;
      if (!base) {
        const { count } = await supabase.from("receipts").select("id", { count: "exact", head: true });
        base = `REC-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, "0")}`;
      }

      const ahora = new Date();
      const meta: MetaRecibo = {
        empresa: "UD GROUP DOMINICANA",
        grupo: sel.grupo || "—",
        tipoPago: sel.tipo_pago || "—",
        fecha: ahora.toLocaleDateString("es-DO"),
        hora: ahora.toLocaleTimeString("es-DO"),
        estadoPago,
        comprobante: compName || "—",
        usuario,
        baseNumero: base,
      };

      // Construir el ZIP con un recibo por transacción
      const { zip } = await construirZipRecibos(pagos, meta, comprobante);

      // Descargar el ZIP
      descargarZip(zip);

      // Subir el ZIP al almacenamiento
      const zipPath = `${user.id}/${sel.id}_recibos.zip`;
      await supabase.storage.from("recibos").upload(zipPath, zip, { upsert: true });

      // Guardar/actualizar el recibo en la BD
      const registro = {
        batch_id: sel.id,
        user_id: user.id,
        numero_recibo: base,
        comprobante_file_name: compName,
        comprobante_storage_path: compPath ?? undefined,
        recibo_file_name: `Recibos_${slug(sel.grupo ?? "grupo")}.zip`,
        recibo_storage_path: zipPath,
        estado_pago: estadoPago,
      };
      if (recibo?.id) await supabase.from("receipts").update(registro).eq("id", recibo.id);
      else await supabase.from("receipts").insert(registro);

      await supabase.from("payment_batches").update({ estado: "completado" }).eq("id", sel.id);

      setOk(`Se generaron ${pagos.length} recibos y se descargó el ZIP.`);
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
        <p className="text-slate-500">Adjunta el comprobante del banco y genera un recibo por cada transacción (en un ZIP).</p>
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
              <Dato titulo="Transacciones" valor={String(sel.total_registros)} />
              <Dato titulo="Monto total" valor={money(Number(sel.monto_total))} />
              <Dato titulo="Tipo" valor={sel.tipo_pago || "—"} />
            </div>

            {recibo?.numero_recibo && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                Este proceso ya tiene recibos (base <b>{recibo.numero_recibo}</b>). Puedes regenerarlos.
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

            <p className="mt-3 text-xs text-slate-500">Se generará <b>un recibo PDF por cada transacción</b> ({sel.total_registros}) dentro de un archivo ZIP.</p>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {ok && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>}

            <div className="mt-5 flex justify-end">
              <button onClick={generar} disabled={trabajando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {trabajando ? "Generando recibos…" : `Generar ${sel.total_registros} recibos (ZIP)`}
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
