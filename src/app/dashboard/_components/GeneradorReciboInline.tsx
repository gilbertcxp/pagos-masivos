"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  construirZipRecibos,
  type PagoRecibo,
  type MetaRecibo,
} from "@/lib/recibo/generarRecibos";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
const slug = (s: string) =>
  (s || "grupo")
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);

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
  estado_pago: string;
  pagado_en: string | null;
};

type BatchReceipt = {
  id: string;
  comprobante_file_name: string | null;
};

export default function GeneradorReciboInline({
  batchId,
  grupo,
  tipoPago,
  tieneTxt,
}: {
  batchId: string;
  grupo: string | null;
  tipoPago: string | null;
  tieneTxt: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [pagos, setPagos] = useState<Payment[]>([]);
  const [cargando, setCargando] = useState(true);
  const [batchReceipt, setBatchReceipt] = useState<BatchReceipt | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const pagosSeleccionados = pagos.filter((p) => seleccionados.has(p.id));
  const montoSeleccionado = pagosSeleccionados.reduce((s, p) => s + Number(p.monto), 0);
  const todosSeleccionados = pagos.length > 0 && pagosSeleccionados.length === pagos.length;
  const puedeGenerar = pagosSeleccionados.length > 0 && !trabajando;

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    const [{ data: pays }, { data: receipt }] = await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, fila, beneficiario, cedula_rnc, cuenta_banco, banco_destino, tipo_cuenta, monto, concepto, estado_pago, pagado_en"
        )
        .eq("batch_id", batchId)
        .order("fila", { ascending: true }),
      supabase
        .from("receipts")
        .select("id, comprobante_file_name")
        .eq("batch_id", batchId)
        .maybeSingle(),
    ]);
    const payList = (pays ?? []) as Payment[];
    setPagos(payList);
    setSeleccionados(new Set(payList.map((p) => p.id)));
    setBatchReceipt((receipt as BatchReceipt) ?? null);
    setCargando(false);
  }, [supabase, batchId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

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
      setSeleccionados(new Set(pagos.map((p) => p.id)));
    }
  }

  function descargarZip(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.download = `Recibos_${slug(grupo ?? "grupo")}_${fecha}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function generar() {
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

      const base = new Date().toISOString().slice(0, 10);
      const [fy, fm, fd] = base.split("-");
      const logoDataUrl = await cargarLogo("/assets/logo-la-primera.png");

      const meta: MetaRecibo = {
        empresa: "UD GROUP DOMINICANA",
        grupo: grupo || "—",
        tipoPago: tipoPago || "—",
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

      const { zip } = await construirZipRecibos(pagosParaRecibo, meta, null);

      // Descarga inmediata — antes de cualquier operación en BD
      descargarZip(zip);

      setOk(`${pagosSeleccionados.length} recibos descargados correctamente.`);

      // Guardar copia en Storage (no bloquea ni falla la descarga)
      try {
        const zipPath = `${user.id}/${batchId}_recibos_${base}.zip`;
        await supabase.storage.from("recibos").upload(zipPath, zip, { upsert: true });
        const receiptBase = {
          numero_recibo: base,
          recibo_file_name: `Recibos_${slug(grupo ?? "grupo")}_${base}.zip`,
          recibo_storage_path: zipPath,
          estado_pago: "confirmado",
        };
        if (batchReceipt?.id) {
          await supabase.from("receipts").update(receiptBase).eq("id", batchReceipt.id);
        } else {
          await supabase.from("receipts").insert({ ...receiptBase, batch_id: batchId, user_id: user.id });
        }
      } catch { /* error de almacenamiento no bloquea la descarga */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error al generar los recibos.");
    } finally {
      setTrabajando(false);
    }
  }

  if (cargando) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-center text-sm text-slate-400">Cargando módulo de recibos…</p>
      </div>
    );
  }

  const todosPagados = pagos.length > 0 && pagos.every((p) => p.estado_pago === "pagado");

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-5 space-y-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Generar Recibos de Pago</h2>
          <p className="text-xs text-slate-500">
            Selecciona los pagos y genera los comprobantes. Puedes descargarlos las veces que necesites.
          </p>
        </div>
        {todosPagados && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Todos pagados
          </span>
        )}
      </div>

      <>
          {/* Aviso cuando aún no hay TXT */}
          {!tieneTxt && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Genera el TXT primero para habilitar la generación de recibos.
            </div>
          )}

          {/* Tabla de pagos con checkboxes — visible antes y después del TXT */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {tieneTxt ? "Pagos a incluir en los recibos" : "Revisión de pagos"}
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={todosSeleccionados}
                        onChange={toggleTodos}
                        disabled={pagos.length === 0}
                        title={todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 disabled:opacity-40"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">#</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Beneficiario</th>
                    <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 sm:table-cell">Cédula/RNC</th>
                    <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 md:table-cell">Banco</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Monto</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagos.map((p) => {
                    const pagado = p.estado_pago === "pagado";
                    const checked = seleccionados.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => toggleSeleccion(p.id)}
                        className={`cursor-pointer transition-colors ${
                          checked ? "bg-blue-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSeleccion(p.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{p.fila ?? "—"}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{p.beneficiario || "—"}</td>
                        <td className="hidden px-3 py-2.5 text-slate-500 sm:table-cell">{p.cedula_rnc || "—"}</td>
                        <td className="hidden px-3 py-2.5 text-slate-500 md:table-cell">{p.banco_destino || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-800">{money(Number(p.monto))}</td>
                        <td className="px-3 py-2.5 text-center">
                          {pagado ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Pagado</span>
                          ) : (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumen */}
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                {pagosSeleccionados.length} de {pagos.length} seleccionados
                {pagos.some((p) => p.estado_pago === "pagado") && (
                  <> · {pagos.filter((p) => p.estado_pago === "pagado").length} pagados</>
                )}
              </span>
              {pagosSeleccionados.length > 0 && (
                <span className="font-semibold text-slate-700">{money(montoSeleccionado)}</span>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">
              {pagosSeleccionados.length === 0
                ? "Selecciona al menos un pago."
                : `Listo: ${pagosSeleccionados.length} recibos · ${money(montoSeleccionado)}`}
            </p>
            <button
              onClick={generar}
              disabled={!puedeGenerar}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {trabajando
                ? "Generando…"
                : `Generar Recibos de Pago (ZIP)`}
            </button>
          </div>
        </>
    </div>
  );
}
