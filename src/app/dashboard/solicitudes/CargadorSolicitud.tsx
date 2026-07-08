"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  parseSolicitudRows,
  type ParsedSolicitud,
} from "@/lib/excel/parseSolicitud";
import { publicarSolicitud } from "@/app/dashboard/_actions/flujo";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    maximumFractionDigits: 2,
  }).format(n);

type Fase = "inicial" | "previsualizando" | "guardando" | "guardado" | "publicando";

export default function CargadorSolicitud() {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("inicial");
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const [datos, setDatos] = useState<ParsedSolicitud | null>(null);
  const [contrato, setContrato] = useState("");
  const [conceptos, setConceptos] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Datos del batch creado
  const [batchId, setBatchId] = useState<string | null>(null);
  const [numeroSolicitud, setNumeroSolicitud] = useState<string>("");

  async function leerArchivo(f: File) {
    setError("");
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown[][];
      const res = parseSolicitudRows(rows);
      setFile(f);
      setFileName(f.name);
      setHojas(wb.SheetNames);
      setDatos(res);
      setFase("previsualizando");
    } catch (e) {
      console.error(e);
      setError("No se pudo leer el archivo. Asegúrate de que sea un Excel (.xlsx) válido.");
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) leerArchivo(f);
  }

  function reiniciar() {
    setFase("inicial");
    setDatos(null);
    setFile(null);
    setFileName("");
    setHojas([]);
    setContrato("");
    setConceptos([]);
    setBatchId(null);
    setNumeroSolicitud("");
    setError("");
  }

  async function guardar() {
    if (!datos || !file) return;
    setFase("guardando");
    setError("");
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setFase("previsualizando");
      return;
    }

    // 1) Crear el proceso (batch) en estado borrador
    //    El trigger set_numero_solicitud asigna numero_solicitud automáticamente
    const { data: batch, error: eBatch } = await supabase
      .from("payment_batches")
      .insert({
        user_id: user.id,
        estado: "borrador",
        excel_file_name: fileName,
        grupo: datos.meta.grupo,
        contrato: contrato.trim() || null,
        conceptos_pagar: conceptos,
        encargado: datos.meta.encargado,
        solicitado_por: datos.meta.solicitadoPor,
        total_registros: datos.totalRegistros,
        total_beneficiarios: datos.beneficiarios,
        monto_total: datos.montoTotal,
      })
      .select("id, numero_solicitud")
      .single();

    if (eBatch || !batch) {
      setError("No se pudo guardar la solicitud: " + (eBatch?.message ?? ""));
      setFase("previsualizando");
      return;
    }

    // 2) Subir el Excel al almacenamiento (no bloqueante si falla)
    const path = `${user.id}/${batch.id}.xlsx`;
    const { error: eUp } = await supabase.storage
      .from("excel-solicitudes")
      .upload(path, file, { upsert: true });
    if (!eUp) {
      await supabase
        .from("payment_batches")
        .update({ excel_storage_path: path })
        .eq("id", batch.id);
    }

    // 3) Insertar los pagos
    const filas = datos.pagos.map((p) => ({
      batch_id: batch.id,
      fila: p.fila,
      beneficiario: p.beneficiario,
      cedula_rnc: p.cedula,
      cuenta_banco: p.cuenta,
      banco_destino: p.banco,
      tipo_cuenta: p.tipo,
      monto: p.monto,
      concepto: p.descripcion,
      tiene_error: p.errores.length > 0,
      errores: p.errores,
    }));
    const { error: ePagos } = await supabase.from("payments").insert(filas);
    if (ePagos) {
      setError("La solicitud se creó pero falló al guardar los pagos: " + ePagos.message);
      setFase("previsualizando");
      return;
    }

    // 4) Auditoría de creación
    const { data: perfil } = await supabase.from("profiles").select("nombre, correo, rol").eq("id", user.id).single();
    await supabase.from("audit_log").insert({
      batch_id: batch.id,
      user_id: user.id,
      user_nombre: perfil?.nombre || perfil?.correo || null,
      user_rol: perfil?.rol ?? null,
      accion: "crear",
      descripcion: `Solicitud ${batch.numero_solicitud ?? ""} creada (${datos.totalRegistros} pagos)`,
      meta: { archivo: fileName, grupo: datos.meta.grupo, contrato: contrato.trim() || null },
    });

    setBatchId(batch.id);
    setNumeroSolicitud(batch.numero_solicitud ?? "");
    setFase("guardado");
  }

  async function publicar() {
    if (!batchId) return;
    setFase("publicando");
    setError("");
    try {
      await publicarSolicitud(batchId);
      router.push("/dashboard/solicitudes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar la solicitud.");
      setFase("guardado");
    }
  }

  // ---------- Vistas ----------

  if (fase === "inicial") {
    return (
      <Encabezado>
        <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white py-20 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </div>
          <p className="font-medium text-slate-700">Haz clic para subir tu Excel</p>
          <p className="text-sm text-slate-400">Archivos .xlsx · una hoja por grupo</p>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onInput} />
        </label>
        {error && <Alerta>{error}</Alerta>}
      </Encabezado>
    );
  }

  if (fase === "guardado") {
    return (
      <Encabezado>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p className="text-lg font-semibold text-slate-800">¡Solicitud guardada en borrador!</p>
          <p className="text-sm text-slate-600">
            <b>{numeroSolicitud}</b> · {datos?.totalRegistros} pagos · {money(datos?.montoTotal ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ahora puedes publicarla para que Contabilidad la revise.</p>

          {error && <Alerta>{error}</Alerta>}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onClick={reiniciar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cargar otra</button>
            <Link href="/dashboard/solicitudes" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ver mis solicitudes</Link>
            <button onClick={publicar} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Publicar solicitud →
            </button>
          </div>
        </div>
      </Encabezado>
    );
  }

  if (fase === "publicando") {
    return (
      <Encabezado>
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-slate-500">Publicando…</div>
      </Encabezado>
    );
  }

  // previsualizando / guardando
  if (!datos) return null;
  const faltanColumnas = datos.columnasFaltantes.length > 0;

  return (
    <Encabezado>
      {/* Barra de archivo */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">{fileName}</p>
            <p className="text-xs text-slate-500">
              Grupo: {datos.meta.grupo || "—"} · Encargado: {datos.meta.encargado || "—"} · {datos.meta.fecha || "—"}
            </p>
          </div>
        </div>
        <button onClick={reiniciar} className="text-sm font-medium text-slate-500 hover:text-slate-800">Cambiar archivo</button>
      </div>

      {hojas.length > 1 && (
        <Alerta tipo="aviso">
          El archivo tiene {hojas.length} hojas ({hojas.join(", ")}). Se procesó solo la primera: <b>{hojas[0]}</b>.
        </Alerta>
      )}

      {faltanColumnas ? (
        <Alerta>
          El Excel no tiene el formato esperado. Faltan columnas: <b>{datos.columnasFaltantes.join(", ")}</b>.
        </Alerta>
      ) : (
        <>
          {/* Datos del contrato */}
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Número o nombre del contrato (opcional)</label>
            <input
              value={contrato}
              onChange={(e) => setContrato(e.target.value)}
              placeholder="Ej: CTR-2026-045"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>

          {/* Conceptos a pagar */}
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Conceptos a pagar</p>
            <div className="flex flex-wrap gap-6">
              {["Energía", "Renta", "Internet"].map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={conceptos.includes(c)}
                    onChange={() =>
                      setConceptos((prev) =>
                        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">{c}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Pagos" valor={String(datos.totalRegistros)} />
            <Tarjeta titulo="Monto total" valor={money(datos.montoTotal)} />
            <Tarjeta titulo="Beneficiarios" valor={String(datos.beneficiarios)} />
            <Tarjeta titulo="Con errores" valor={String(datos.totalConErrores)} alerta={datos.totalConErrores > 0} />
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Beneficiario</th>
                  <th className="px-3 py-2 text-left font-medium">Cédula/RNC</th>
                  <th className="px-3 py-2 text-left font-medium">Banco</th>
                  <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.pagos.map((p) => (
                  <tr key={p.fila} className={"border-t border-slate-100 " + (p.errores.length ? "bg-red-50" : "")}>
                    <td className="px-3 py-2 text-slate-400">{p.fila}</td>
                    <td className="px-3 py-2 text-slate-800 capitalize">{p.beneficiario || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{p.cedula || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{p.banco || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{p.cuenta || "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{money(p.monto)}</td>
                    <td className="px-3 py-2">
                      {p.errores.length ? (
                        <span className="text-xs text-red-600" title={p.errores.join("\n")}>⚠ {p.errores.length} error(es)</span>
                      ) : (
                        <span className="text-xs text-emerald-600">✓ ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <Alerta>{error}</Alerta>}

          {/* Acciones */}
          <div className="mt-5 flex items-center justify-end gap-3">
            {datos.totalConErrores > 0 && (
              <p className="mr-auto text-sm text-amber-600">Hay {datos.totalConErrores} fila(s) con errores. Puedes guardar el borrador y corregirlas antes de publicar.</p>
            )}
            <button onClick={reiniciar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button onClick={guardar} disabled={fase === "guardando"} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
              {fase === "guardando" ? "Guardando…" : "Guardar como borrador"}
            </button>
          </div>
        </>
      )}
    </Encabezado>
  );
}

// ---------- Piezas de UI ----------

function Encabezado({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="mb-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Módulo 1 · Contratos</span>
          <h1 className="text-2xl font-bold text-slate-800">Nueva Solicitud de Pago</h1>
          <p className="text-slate-500">Carga el Excel, revisa el resumen y publica la solicitud.</p>
        </div>
        <Link href="/dashboard/solicitudes" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ver mis solicitudes</Link>
      </div>
      {children}
    </div>
  );
}

function Tarjeta({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={"rounded-xl border bg-white p-4 " + (alerta ? "border-red-200" : "border-slate-100")}>
      <p className={"text-xl font-bold " + (alerta ? "text-red-600" : "text-slate-800")}>{valor}</p>
      <p className="text-xs text-slate-500">{titulo}</p>
    </div>
  );
}

function Alerta({ children, tipo = "error" }: { children: React.ReactNode; tipo?: "error" | "aviso" }) {
  const clase =
    tipo === "aviso"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={"mt-4 rounded-lg border px-4 py-3 text-sm " + clase}>{children}</div>;
}
