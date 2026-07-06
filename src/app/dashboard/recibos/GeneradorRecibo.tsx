"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { construirZipRecibos, type PagoRecibo, type MetaRecibo } from "@/lib/recibo/generarRecibos";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
const slug = (s: string) =>
  (s || "grupo").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

async function cargarLogo(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    const blob = await r.blob();
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

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

type Payment = {
  id: string;
  fila: number | null;
  beneficiario: string | null;
  cedula_rnc: string | null;
  cuenta_banco: string | null;
  banco_destino: string | null;
  tipo_cuenta: string | null;
  monto: number;
  concepto: string | null;
  estado_pago: string;   // 'pendiente' | 'pagado'
  pagado_en: string | null;
};

type BatchReceipt = {
  id: string;
  comprobante_file_name: string | null;
};

export default function GeneradorRecibo() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<Batch | null>(null);
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [cargandoPagos, setCargandoPagos] = useState(false);
  const [batchReceipt, setBatchReceipt] = useState<BatchReceipt | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [fechaComprobante, setFechaComprobante] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const tieneComprobante = !!comprobante || !!batchReceipt?.comprobante_file_name;
  const pagosPendientes = pagos.filter((p) => p.estado_pago !== "pagado");
  const pagosSeleccionados = pagosPendientes.filter((p) => seleccionados.has(p.id));
  const montoSeleccionado = pagosSeleccionados.reduce((s, p) => s + Number(p.monto), 0);
  const todosSeleccionados =
    pagosPendientes.length > 0 && pagosSeleccionados.length === pagosPendientes.length;
  const puedeGenerar = tieneComprobante && pagosSeleccionados.length > 0 && !trabajando;

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("payment_batches")
      .select("id, grupo, tipo_pago, estado, total_registros, monto_total, txt_file_name, created_at")
      .not("txt_file_name", "is", null)
      .neq("estado", "cancelada")
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
    setCargandoPagos(true);

    const [{ data: pays }, { data: receipt }] = await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, fila, beneficiario, cedula_rnc, cuenta_banco, banco_destino, tipo_cuenta, monto, concepto, estado_pago, pagado_en"
        )
        .eq("batch_id", b.id)
        .order("fila", { ascending: true }),
      supabase
        .from("receipts")
        .select("id, comprobante_file_name")
        .eq("batch_id", b.id)
        .maybeSingle(),
    ]);

    const payList = (pays ?? []) as Payment[];
    setPagos(payList);
    setSeleccionados(new Set(payList.filter((p) => p.estado_pago !== "pagado").map((p) => p.id)));
    setBatchReceipt((receipt as BatchReceipt) ?? null);
    setCargandoPagos(false);
  }

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(pagosPendientes.map((p) => p.id)));
    }
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

    if (!tieneComprobante) {
      setError("Debes adjuntar el comprobante de Banreservas antes de generar los recibos.");
      return;
    }
    if (pagosSeleccionados.length === 0) {
      setError("Selecciona al menos un pago antes de continuar.");
      return;
    }

    setTrabajando(true);
    setError("");
    setOk("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada. Inicia sesión de nuevo.");

      const { data: perfil } = await supabase
        .from("profiles")
        .select("nombre, correo")
        .eq("id", user.id)
        .single();
      const usuario = perfil?.nombre || perfil?.correo || "Usuario";

      // Subir comprobante si se adjuntó uno nuevo
      let compName = batchReceipt?.comprobante_file_name ?? null;
      let compPath: string | null = null;
      if (comprobante) {
        const ext = comprobante.name.split(".").pop() || "pdf";
        compPath = `${user.id}/${sel.id}_comprobante.${ext}`;
        const { error: eUp } = await supabase.storage
          .from("comprobantes")
          .upload(compPath, comprobante, { upsert: true });
        if (eUp) throw new Error("No se pudo subir el comprobante: " + eUp.message);
        compName = comprobante.name;
      }

      const base = fechaComprobante || new Date().toISOString().slice(0, 10);
      const [fy, fm, fd] = base.split("-");
      const logoDataUrl = await cargarLogo("/assets/logo-la-primera.png");

      const meta: MetaRecibo = {
        empresa: "UD GROUP DOMINICANA",
        grupo: sel.grupo || "—",
        tipoPago: sel.tipo_pago || "—",
        fechaComprobante: `${fd}/${fm}/${fy}`,
        estadoPago: "confirmado",
        usuario,
        baseNumero: base,
        logoDataUrl,
      };

      const pagosParaRecibo: PagoRecibo[] = pagosSeleccionados.map((p) => ({
        beneficiario: p.beneficiario ?? "",
        cedula: p.cedula_rnc ?? "",
        banco: p.banco_destino ?? "",
        cuenta: p.cuenta_banco ?? "",
        tipoCuenta: p.tipo_cuenta ?? "",
        monto: Number(p.monto ?? 0),
        concepto: p.concepto ?? "",
      }));

      const { zip } = await construirZipRecibos(pagosParaRecibo, meta, comprobante);
      descargarZip(zip);

      // Guardar ZIP en Storage
      const zipPath = `${user.id}/${sel.id}_recibos_${base}.zip`;
      await supabase.storage.from("recibos").upload(zipPath, zip, { upsert: true });

      // Upsert registro de recibo en BD (nivel de lote)
      const receiptBase = {
        numero_recibo: base,
        comprobante_file_name: compName,
        recibo_file_name: `Recibos_${slug(sel.grupo ?? "grupo")}_${base}.zip`,
        recibo_storage_path: zipPath,
        estado_pago: "confirmado",
      };
      if (batchReceipt?.id) {
        await supabase
          .from("receipts")
          .update({ ...receiptBase, ...(compPath ? { comprobante_storage_path: compPath } : {}) })
          .eq("id", batchReceipt.id);
      } else {
        await supabase.from("receipts").insert({
          ...receiptBase,
          batch_id: sel.id,
          user_id: user.id,
          ...(compPath ? { comprobante_storage_path: compPath } : {}),
        });
      }

      // Marcar pagos seleccionados como pagados
      const ahora = new Date().toISOString();
      const idsSeleccionados = pagosSeleccionados.map((p) => p.id);
      await supabase
        .from("payments")
        .update({ estado_pago: "pagado", pagado_en: ahora, pagado_por: user.id })
        .in("id", idsSeleccionados);

      // Actualizar estado del lote
      const yaPagados = pagos.filter((p) => p.estado_pago === "pagado").length;
      const totalPagadosAhora = yaPagados + idsSeleccionados.length;
      const nuevoEstado = totalPagadosAhora >= pagos.length ? "completado" : "pagada";
      await supabase
        .from("payment_batches")
        .update({ estado: nuevoEstado })
        .eq("id", sel.id);

      setOk(`Se generaron ${pagosSeleccionados.length} recibos y se descargó el ZIP.`);
      await seleccionar(sel);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setTrabajando(false);
    }
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          Módulo 4
        </span>
        <h1 className="text-2xl font-bold text-slate-800">Recibo de Pago</h1>
        <p className="text-slate-500">
          Selecciona los pagos realizados, adjunta el comprobante de Banreservas y genera los
          recibos de pago.
        </p>
      </div>

      {!sel ? (
        /* ── LISTA DE PROCESOS ───────────────────────────────────────────────── */
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">
            Procesos con TXT generado
          </div>
          {cargando ? (
            <p className="px-5 py-10 text-center text-slate-400">Cargando…</p>
          ) : batches.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-400">
              No hay procesos con TXT generado aún.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {batches.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => seleccionar(b)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{b.grupo || "Proceso"}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(b.created_at).toLocaleString("es-DO")} · {b.total_registros}{" "}
                        pagos · {money(Number(b.monto_total))}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">
                      {b.estado.replace(/_/g, " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* ── DETALLE DEL PROCESO ─────────────────────────────────────────────── */
        <>
          <button
            onClick={() => {
              setSel(null);
              setPagos([]);
            }}
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            ← Volver a la lista
          </button>

          <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5">
            {/* Resumen del lote */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dato titulo="Grupo" valor={sel.grupo || "—"} />
              <Dato titulo="Registros" valor={String(sel.total_registros)} />
              <Dato titulo="Monto total" valor={money(Number(sel.monto_total))} />
              <Dato titulo="Tipo" valor={sel.tipo_pago || "—"} />
            </div>

            {/* ── SECCIÓN 1: COMPROBANTE ─────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                1. Comprobante del banco
              </p>

              {!tieneComprobante && (
                <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Requerido</p>
                    <p className="text-xs text-amber-700">
                      Adjunta el PDF de confirmación de Banreservas para poder generar los recibos.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Upload comprobante */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
                    Comprobante Banreservas (PDF)
                    <span className="text-red-500">*</span>
                  </label>
                  <div
                    className={`relative rounded-lg border-2 border-dashed px-4 py-3 transition-colors ${
                      comprobante
                        ? "border-emerald-400 bg-emerald-50"
                        : batchReceipt?.comprobante_file_name
                        ? "border-slate-300 bg-slate-50"
                        : "border-amber-300 bg-amber-50"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        setComprobante(e.target.files?.[0] ?? null);
                        setError("");
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    {comprobante ? (
                      <div className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="truncate text-sm font-medium text-emerald-700">
                          {comprobante.name}
                        </span>
                      </div>
                    ) : batchReceipt?.comprobante_file_name ? (
                      <div className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 shrink-0 text-slate-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                          />
                        </svg>
                        <span className="truncate text-sm text-slate-600">
                          {batchReceipt.comprobante_file_name}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">
                          clic para reemplazar
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-700">
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <span className="text-sm font-medium">Adjuntar PDF de Banreservas</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fecha del comprobante */}
                <div>
                  <label className="mb-1 text-sm font-medium text-slate-700">
                    Fecha del comprobante
                    <span className="ml-1 text-xs font-normal text-slate-400">(del banco)</span>
                  </label>
                  <input
                    type="date"
                    value={fechaComprobante}
                    onChange={(e) => setFechaComprobante(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Define el No. de recibo (ej: {fechaComprobante}-001)
                  </p>
                </div>
              </div>
            </div>

            {/* ── SECCIÓN 2: TABLA DE PAGOS ─────────────────────────────────── */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                2. Selecciona los pagos realizados
              </p>

              {cargandoPagos ? (
                <p className="py-8 text-center text-sm text-slate-400">Cargando pagos…</p>
              ) : pagos.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Este proceso no tiene pagos registrados.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left">
                          <th className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={todosSeleccionados}
                              onChange={toggleTodos}
                              disabled={pagosPendientes.length === 0}
                              title={
                                todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"
                              }
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 disabled:opacity-40"
                            />
                          </th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">#</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">
                            Beneficiario
                          </th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 sm:table-cell">
                            Cédula / RNC
                          </th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 md:table-cell">
                            Banco
                          </th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">
                            Monto
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagos.map((p) => {
                          const pagado = p.estado_pago === "pagado";
                          const checked = seleccionados.has(p.id);
                          return (
                            <tr
                              key={p.id}
                              onClick={() => !pagado && toggleSeleccion(p.id)}
                              className={`transition-colors ${
                                pagado
                                  ? "bg-slate-50 opacity-60"
                                  : checked
                                  ? "bg-blue-50"
                                  : "cursor-pointer hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-3 py-2.5">
                                {pagado ? (
                                  <svg
                                    className="h-4 w-4 text-emerald-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleSeleccion(p.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400">{p.fila ?? "—"}</td>
                              <td className="px-3 py-2.5 font-medium text-slate-800">
                                {p.beneficiario || "—"}
                              </td>
                              <td className="hidden px-3 py-2.5 text-slate-500 sm:table-cell">
                                {p.cedula_rnc || "—"}
                              </td>
                              <td className="hidden px-3 py-2.5 text-slate-500 md:table-cell">
                                {p.banco_destino || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                                {money(Number(p.monto))}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {pagado ? (
                                  <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    Pagado
                                  </span>
                                ) : (
                                  <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen de selección */}
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {pagosSeleccionados.length} de {pagosPendientes.length} pendientes
                      seleccionados
                      {pagos.some((p) => p.estado_pago === "pagado") && (
                        <>
                          {" "}
                          · {pagos.filter((p) => p.estado_pago === "pagado").length} ya pagados
                        </>
                      )}
                    </span>
                    {pagosSeleccionados.length > 0 && (
                      <span className="font-semibold text-slate-700">
                        {money(montoSeleccionado)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Mensajes */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {error}
              </div>
            )}
            {ok && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {ok}
              </div>
            )}

            {/* Botón generar */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400">
                {!tieneComprobante
                  ? "Adjunta el comprobante para habilitar la generación."
                  : pagosSeleccionados.length === 0
                  ? "Selecciona al menos un pago."
                  : `Listo: ${pagosSeleccionados.length} recibos · ${money(montoSeleccionado)}`}
              </p>
              <button
                onClick={generar}
                disabled={!puedeGenerar}
                title={
                  !tieneComprobante
                    ? "Adjunta el comprobante primero"
                    : pagosSeleccionados.length === 0
                    ? "Selecciona al menos un pago"
                    : undefined
                }
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {trabajando
                  ? "Generando recibos…"
                  : `Generar ${pagosSeleccionados.length || ""} Recibos de Pago (ZIP)`}
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
