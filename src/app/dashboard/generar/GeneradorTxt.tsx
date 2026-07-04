"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { detectarTipoPago, type PagoRow } from "@/lib/excel/parseSolicitud";
import {
  generarTxtTerceros,
  type ConfigOrigen,
  type ResultadoTxt,
} from "@/lib/txt/generarTerceros";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const normNombre = (s: string) =>
  String(s ?? "")
    .replace(/[áéíóúüñ]/gi, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u", Ñ: "n" })[c] ?? c)
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
  const [solicitudes, setSolicitudes] = useState<Batch[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<Batch | null>(null);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [buscandoGrupo, setBuscandoGrupo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTxt | null>(null);
  const [error, setError] = useState("");

  // Formulario de cuenta de origen (cuando el grupo no está configurado)
  const [formNombre, setFormNombre] = useState("");
  const [formTipo, setFormTipo] = useState<"CA" | "CC">("CC");
  const [formCuenta, setFormCuenta] = useState("");

  const cargarSolicitudes = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("payment_batches")
      .select("id, grupo, excel_file_name, total_registros, monto_total, estado, created_at")
      .order("created_at", { ascending: false });
    setSolicitudes(data ?? []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargarSolicitudes();
  }, [cargarSolicitudes]);

  async function seleccionar(b: Batch) {
    setSel(b);
    setResultado(null);
    setError("");
    setGrupo(null);
    setBuscandoGrupo(true);

    // Cargar pagos
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

    // Buscar la cuenta de origen del grupo
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

  async function generar() {
    if (!sel || !grupo) return;
    setError("");
    const origen: ConfigOrigen = {
      tipoCuenta: grupo.tipo_cuenta_origen as "CA" | "CC",
      moneda: grupo.moneda || "DOP",
      numeroCuenta: grupo.numero_cuenta_origen,
    };
    const res = generarTxtTerceros(pagos, origen, { descripcionDesde: "descripcion" });
    setResultado(res);

    if (res.incluidos === 0) return;

    // Descargar automáticamente el archivo generado
    descargar(res.contenido);

    // Guardar en historial + storage (no bloqueante)
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const slug = normNombre(sel.grupo ?? "grupo").replace(/[^A-Z0-9]+/g, "_");
    const nombreArchivo = `TERCEROS_${slug}_${fecha}.txt`;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const path = `${user.id}/${sel.id}_terceros.txt`;
        const blob = new Blob([res.contenido], { type: "text/plain" });
        await supabase.storage.from("txt-generados").upload(path, blob, { upsert: true });
        await supabase
          .from("payment_batches")
          .update({
            tipo_pago: "terceros",
            estado: "txt_generado",
            txt_file_name: nombreArchivo,
            txt_storage_path: path,
            txt_generated_at: new Date().toISOString(),
          })
          .eq("id", sel.id);
        cargarSolicitudes();
      }
    } catch (e) {
      console.error("No se pudo guardar en historial", e);
    }
  }

  function nombreTxt() {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const slug = normNombre(sel?.grupo || formNombre || "grupo").replace(/[^A-Z0-9]+/g, "_");
    return `TERCEROS_${slug}_${fecha}.txt`;
  }

  function descargar(contenido: string) {
    const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreTxt();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Vistas ----------
  const terceros = pagos.filter((p) => p.tipoPago === "terceros").length;
  const otros = pagos.length - terceros;

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Módulo 3 · Terceros</span>
        <h1 className="text-2xl font-bold text-slate-800">Generar TXT (Terceros)</h1>
        <p className="text-slate-500">Genera el archivo del banco para los pagos a Banreservas.</p>
      </div>

      {!sel ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-800">Elige una solicitud</div>
          {cargando ? (
            <p className="px-5 py-10 text-center text-slate-400">Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-400">No hay solicitudes. Carga una en el Módulo 1.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {solicitudes.map((b) => (
                <li key={b.id}>
                  <button onClick={() => seleccionar(b)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{b.grupo || b.excel_file_name || "Solicitud"}</p>
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
          <button onClick={() => { setSel(null); setResultado(null); }} className="text-sm font-medium text-slate-500 hover:text-slate-800">← Volver a la lista</button>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">{sel.grupo || "Sin grupo"}</p>
                <p className="text-sm text-slate-500">{sel.excel_file_name}</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">Terceros (Banreservas): {terceros}</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">Otros bancos: {otros}</span>
              </div>
            </div>
          </div>

          {/* Cuenta de origen */}
          {buscandoGrupo ? (
            <p className="text-slate-400">Buscando cuenta del grupo…</p>
          ) : !grupo ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="mb-1 font-semibold text-slate-800">Configura la cuenta de origen de este grupo</p>
              <p className="mb-4 text-sm text-slate-600">Es la cuenta Banreservas de donde saldrá el dinero. Se guardará para las próximas veces.</p>
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div>
                <p className="text-sm text-slate-600">Cuenta de origen configurada:</p>
                <p className="font-semibold text-slate-800">{grupo.tipo_cuenta_origen} · {grupo.moneda} · {grupo.numero_cuenta_origen}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setGrupo(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cambiar</button>
                <button onClick={generar} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">Generar TXT</button>
              </div>
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* Resultado */}
          {resultado && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-800">{resultado.incluidos} pagos · {money(resultado.montoTotal)}</p>
                  <p className="text-sm text-slate-500">Listos para el banco (solo Banreservas).</p>
                </div>
                {resultado.incluidos > 0 && (
                  <button onClick={() => descargar(resultado.contenido)} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700">⬇ Descargar TXT de nuevo</button>
                )}
              </div>

              {resultado.incluidos > 0 && (
                <pre className="mb-4 max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{resultado.contenido}</pre>
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
          )}
        </>
      )}
    </div>
  );
}
