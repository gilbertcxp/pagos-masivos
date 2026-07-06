"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectarTipoPago, type PagoRow } from "@/lib/excel/parseSolicitud";
import {
  generarTxtTerceros,
  type ConfigOrigen,
  type ResultadoTxt,
} from "@/lib/txt/generarTerceros";
import { generarTxtACH } from "@/lib/txt/generarACH";
import { registrarTxtGenerado } from "@/app/dashboard/_actions/flujo";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const normNombre = (s: string) =>
  String(s ?? "")
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) =>
      ({ á:"a",é:"e",í:"i",ó:"o",ú:"u",ü:"u",ñ:"n",Á:"A",É:"E",Í:"I",Ó:"O",Ú:"U",Ü:"U",Ñ:"N" })[c] ?? c)
    .trim()
    .toUpperCase();

type Batch = {
  id: string;
  grupo: string | null;
  excel_file_name: string | null;
  total_registros: number;
  monto_total: number;
  estado: string;
  created_at: string;
};

type Grupo = {
  id: string;
  nombre: string;
  tipo_cuenta_origen: string;
  moneda: string;
  numero_cuenta_origen: string;
};

export default function GeneradorTxt() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchIdUrl = searchParams.get("batch");

  const [solicitudes, setSolicitudes] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<Batch | null>(null);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [buscandoGrupo, setBuscandoGrupo] = useState(false);

  const [resultadoTerceros, setResultadoTerceros] = useState<ResultadoTxt | null>(null);
  const [resultadoACH, setResultadoACH] = useState<ResultadoTxt | null>(null);
  const [generando, setGenerando] = useState<"terceros" | "ach" | null>(null);
  const [error, setError] = useState("");

  const [formNombre, setFormNombre] = useState("");
  const [formTipo, setFormTipo] = useState<"CA" | "CC">("CC");
  const [formCuenta, setFormCuenta] = useState("");

  const cargarSolicitudes = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("payment_batches")
      .select("id, grupo, excel_file_name, total_registros, monto_total, estado, created_at")
      .in("estado", ["publicada", "en_revision", "txt_generado", "borrador"])
      .order("created_at", { ascending: false });
    setSolicitudes(data ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => { cargarSolicitudes(); }, [cargarSolicitudes]);

  useEffect(() => {
    if (!batchIdUrl || sel) return;
    (async () => {
      const { data } = await supabase
        .from("payment_batches")
        .select("id, grupo, excel_file_name, total_registros, monto_total, estado, created_at")
        .eq("id", batchIdUrl)
        .single();
      if (data) seleccionar(data as Batch);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchIdUrl]);

  async function seleccionar(b: Batch) {
    setSel(b);
    setResultadoTerceros(null);
    setResultadoACH(null);
    setError("");
    setGrupo(null);
    setBuscandoGrupo(true);

    const { data: pays } = await supabase
      .from("payments")
      .select("fila, beneficiario, cedula_rnc, cuenta_banco, banco_destino, tipo_cuenta, monto, concepto")
      .eq("batch_id", b.id)
      .order("fila", { ascending: true });

    const filas: PagoRow[] = (pays ?? []).map((p) => ({
      fila: p.fila ?? 0,
      noAgencia: "",
      grupo: b.grupo ?? "",
      beneficiario: p.beneficiario ?? "",
      cedula: p.cedula_rnc ?? "",
      formaPago: "",
      banco: p.banco_destino ?? "",
      cuenta: p.cuenta_banco ?? "",
      tipo: p.tipo_cuenta ?? "",
      monto: Number(p.monto ?? 0),
      montoTexto: "",
      fechaPago: "",
      descripcion: p.concepto ?? "",
      tipoPago: detectarTipoPago(p.banco_destino ?? ""),
      errores: [],
      advertencias: [],
    }));
    setPagos(filas);

    setFormNombre(b.grupo ?? "");
    if (b.grupo) {
      const { data: g } = await supabase
        .from("grupos")
        .select("*")
        .eq("nombre_norm", normNombre(b.grupo))
        .maybeSingle();
      if (g) {
        setGrupo(g as Grupo);
        setFormTipo((g.tipo_cuenta_origen as "CA" | "CC") ?? "CC");
        setFormCuenta(g.numero_cuenta_origen ?? "");
      }
    }
    setBuscandoGrupo(false);
  }

  async function guardarGrupo() {
    setError("");
    if (!formNombre.trim()) return setError("Escribe el nombre del grupo.");
    if (!/^[0-9]{1,10}$/.test(formCuenta.trim()))
      return setError("La cuenta de origen debe ser numérica (máx. 10 dígitos).");
    const registro = {
      nombre: formNombre.trim(),
      nombre_norm: normNombre(formNombre),
      tipo_cuenta_origen: formTipo,
      moneda: "DOP",
      numero_cuenta_origen: formCuenta.trim(),
    };
    const { data, error: e } = await supabase
      .from("grupos")
      .upsert(registro, { onConflict: "nombre_norm" })
      .select("*")
      .single();
    if (e) return setError("No se pudo guardar la cuenta: " + e.message);
    setGrupo(data as Grupo);
  }

  function descargar(contenido: string, nombre: string) {
    const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function nombreArchivo(tipo: "terceros" | "ach") {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const slug = normNombre(sel?.grupo ?? formNombre ?? "grupo").replace(/[^A-Z0-9]+/g, "_");
    return tipo === "terceros"
      ? `TERCEROS_${slug}_${fecha}.txt`
      : `ACH_${slug}_${fecha}.txt`;
  }

  async function generarTerceros() {
    if (!sel || !grupo) return;
    setGenerando("terceros");
    setError("");
    const origen: ConfigOrigen = {
      tipoCuenta: grupo.tipo_cuenta_origen as "CA" | "CC",
      moneda: grupo.moneda || "DOP",
      numeroCuenta: grupo.numero_cuenta_origen,
    };
    const res = generarTxtTerceros(pagos, origen, { descripcionDesde: "descripcion" });
    setResultadoTerceros(res);
    setGenerando(null);

    if (res.incluidos === 0) return;
    const nombre = nombreArchivo("terceros");
    descargar(res.contenido, nombre);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const path = `${user.id}/${sel.id}_terceros.txt`;
        await supabase.storage.from("txt-generados").upload(
          path, new Blob([res.contenido], { type: "text/plain" }), { upsert: true }
        );
        await supabase.from("payment_batches").update({
          tipo_pago: "terceros",
          txt_file_name: nombre,
          txt_storage_path: path,
          txt_generated_at: new Date().toISOString(),
        }).eq("id", sel.id);
        try { await registrarTxtGenerado(sel.id, nombre, "terceros"); } catch (_) {}
        cargarSolicitudes();
        if (batchIdUrl) setTimeout(() => router.push(`/dashboard/contabilidad/${sel.id}`), 500);
      }
    } catch (_) {}
  }

  async function generarACH() {
    if (!sel || !grupo) return;
    setGenerando("ach");
    setError("");
    const origen: ConfigOrigen = {
      tipoCuenta: grupo.tipo_cuenta_origen as "CA" | "CC",
      moneda: grupo.moneda || "DOP",
      numeroCuenta: grupo.numero_cuenta_origen,
    };
    const res = generarTxtACH(pagos, origen, { descripcionDesde: "descripcion" });
    setResultadoACH(res);
    setGenerando(null);

    if (res.incluidos === 0) return;
    const nombre = nombreArchivo("ach");
    descargar(res.contenido, nombre);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const path = `${user.id}/${sel.id}_ach.txt`;
        await supabase.storage.from("txt-generados").upload(
          path, new Blob([res.contenido], { type: "text/plain" }), { upsert: true }
        );
        await supabase.from("payment_batches").update({
          tipo_pago: "interbancaria",
          txt_file_name: nombre,
          txt_storage_path: path,
          txt_generated_at: new Date().toISOString(),
        }).eq("id", sel.id);
        try { await registrarTxtGenerado(sel.id, nombre, "ACH"); } catch (_) {}
        cargarSolicitudes();
        if (batchIdUrl) setTimeout(() => router.push(`/dashboard/contabilidad/${sel.id}`), 500);
      }
    } catch (_) {}
  }

  const cntTerceros = pagos.filter((p) => p.tipoPago === "terceros").length;
  const cntACH      = pagos.filter((p) => p.tipoPago === "interbancaria").length;

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Módulo 3 · Contabilidad</span>
        <h1 className="text-2xl font-bold text-slate-800">Generar TXT de Pagos</h1>
        <p className="text-slate-500">Genera los archivos TXT para Banreservas (Terceros) y RED ACH (interbancario).</p>
      </div>

      {!sel ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Elige una solicitud</div>
          {cargando ? (
            <p className="px-5 py-10 text-center text-slate-400">Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-400">No hay solicitudes activas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {solicitudes.map((b) => (
                <li key={b.id}>
                  <button onClick={() => seleccionar(b)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{b.grupo || b.excel_file_name || "Solicitud"}</p>
                      <p className="text-xs text-slate-500">{new Date(b.created_at).toLocaleString("es-DO")} · {b.total_registros} pagos · {money(Number(b.monto_total))}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">{b.estado.replace("_"," ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <button onClick={() => { setSel(null); setResultadoTerceros(null); setResultadoACH(null); }} className="text-sm font-medium text-slate-500 hover:text-slate-800">← Volver a la lista</button>

          {/* Encabezado solicitud */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">{sel.grupo || "Sin grupo"}</p>
                <p className="text-sm text-slate-500">{sel.excel_file_name} · {money(Number(sel.monto_total))}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">
                  Banreservas (Terceros): {cntTerceros}
                </span>
                <span className="rounded-full bg-violet-100 px-3 py-1 font-medium text-violet-700">
                  Interbancario (ACH): {cntACH}
                </span>
              </div>
            </div>
          </div>

          {/* Cuenta de origen */}
          {buscandoGrupo ? (
            <p className="text-slate-400">Buscando cuenta del grupo…</p>
          ) : !grupo ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="mb-1 font-semibold text-slate-800">Configura la cuenta de origen de este grupo</p>
              <p className="mb-4 text-sm text-slate-600">Cuenta Banreservas de donde saldrá el dinero (origen para ambos tipos).</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del grupo</label>
                  <input value={formNombre} onChange={(e) => setFormNombre(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Tipo de cuenta</label>
                  <select value={formTipo} onChange={(e) => setFormTipo(e.target.value as "CA" | "CC")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="CC">Corriente (CC)</option>
                    <option value="CA">Ahorros (CA)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Número de cuenta</label>
                  <input value={formCuenta} onChange={(e) => setFormCuenta(e.target.value)} inputMode="numeric" placeholder="9600882715" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <button onClick={guardarGrupo} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Guardar cuenta del grupo</button>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-slate-600">Cuenta de origen:</p>
                  <p className="font-semibold text-slate-800">{grupo.tipo_cuenta_origen} · {grupo.moneda} · {grupo.numero_cuenta_origen}</p>
                </div>
                <button onClick={() => setGrupo(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Cambiar</button>
              </div>

              {/* Botones de generación */}
              <div className="flex flex-wrap gap-3">
                {cntTerceros > 0 && (
                  <button
                    onClick={generarTerceros}
                    disabled={generando !== null}
                    className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {generando === "terceros" ? "Generando…" : `⬇ TXT Terceros (${cntTerceros} pagos)`}
                  </button>
                )}
                {cntACH > 0 && (
                  <button
                    onClick={generarACH}
                    disabled={generando !== null}
                    className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {generando === "ach" ? "Generando…" : `⬇ TXT ACH (${cntACH} pagos)`}
                  </button>
                )}
                {cntTerceros === 0 && cntACH === 0 && (
                  <p className="text-sm text-slate-500">No hay pagos válidos para generar TXT.</p>
                )}
              </div>
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* Resultado Terceros */}
          {resultadoTerceros && (
            <ResultadoPanel
              titulo="TXT Terceros (Banreservas)"
              color="sky"
              resultado={resultadoTerceros}
              onDescargar={() => descargar(resultadoTerceros.contenido, nombreArchivo("terceros"))}
              descripcionOk="Pagos a cuentas Banreservas incluidos."
            />
          )}

          {/* Resultado ACH */}
          {resultadoACH && (
            <ResultadoPanel
              titulo="TXT ACH Interbancario"
              color="violet"
              resultado={resultadoACH}
              onDescargar={() => descargar(resultadoACH.contenido, nombreArchivo("ach"))}
              descripcionOk="Pagos a otros bancos vía RED ACH incluidos."
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Panel de resultado reutilizable ──────────────────────────────────────────

function ResultadoPanel({
  titulo,
  color,
  resultado,
  onDescargar,
  descripcionOk,
}: {
  titulo: string;
  color: "sky" | "violet";
  resultado: ResultadoTxt;
  onDescargar: () => void;
  descripcionOk: string;
}) {
  const ring = color === "sky" ? "border-sky-200" : "border-violet-200";
  const btn  = color === "sky" ? "bg-sky-600 hover:bg-sky-700" : "bg-violet-600 hover:bg-violet-700";
  const money = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  return (
    <div className={`rounded-2xl border ${ring} bg-white p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{titulo}</p>
          <p className="text-lg font-bold text-slate-800">{resultado.incluidos} pagos · {money(resultado.montoTotal)}</p>
          <p className="text-sm text-slate-500">{descripcionOk}</p>
        </div>
        {resultado.incluidos > 0 && (
          <button onClick={onDescargar} className={`rounded-lg ${btn} px-5 py-2 text-sm font-medium text-white`}>
            ⬇ Descargar de nuevo
          </button>
        )}
      </div>

      {resultado.incluidos > 0 && (
        <pre className="mb-4 max-h-52 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {resultado.contenido}
        </pre>
      )}

      {resultado.omitidos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-800">{resultado.omitidos.length} fila(s) NO incluidas:</p>
          <ul className="space-y-1 text-xs text-amber-700">
            {resultado.omitidos.slice(0, 20).map((o, i) => (
              <li key={i}>Fila {o.fila} · {o.beneficiario || "—"}: {o.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
