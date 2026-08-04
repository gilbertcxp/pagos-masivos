"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { construirZipRecibos, type PagoRecibo, type MetaRecibo } from "@/lib/recibo/generarRecibos";
import { fmtFechaHora } from "@/lib/fecha";

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
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendiente" | "pagado">("todos");
  const [orden, setOrden] = useState<{ campo: "fila" | "beneficiario" | "monto"; dir: "asc" | "desc" }>({
    campo: "fila",
    dir: "asc",
  });

  function ordenarPor(campo: "fila" | "beneficiario" | "monto") {
    setOrden((prev) =>
      prev.campo === campo ? { campo, dir: prev.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }
    );
  }

  // Filtros de la lista de procesos (antes de entrar a una solicitud)
  const [busquedaProcesos, setBusquedaProcesos] = useState("");
  const [filtroTipoProceso, setFiltroTipoProceso] = useState<"todos" | "terceros" | "interbancaria">("todos");
  const [filtroEstadoProceso, setFiltroEstadoProceso] = useState<"todos" | "txt_generado" | "pagada" | "completado">("todos");
  const [ordenProcesos, setOrdenProcesos] = useState<{ campo: "fecha" | "grupo" | "monto"; dir: "asc" | "desc" }>({
    campo: "fecha",
    dir: "desc",
  });

  const batchesFiltrados = useMemo(() => {
    const termino = busquedaProcesos.trim().toLowerCase();
    let lista = batches.filter((b) => {
      if (termino && !(b.grupo ?? "").toLowerCase().includes(termino)) return false;
      if (filtroTipoProceso !== "todos" && b.tipo_pago !== filtroTipoProceso) return false;
      if (filtroEstadoProceso !== "todos" && b.estado !== filtroEstadoProceso) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      let cmp = 0;
      if (ordenProcesos.campo === "fecha") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (ordenProcesos.campo === "monto") cmp = Number(a.monto_total) - Number(b.monto_total);
      else cmp = (a.grupo ?? "").localeCompare(b.grupo ?? "");
      return ordenProcesos.dir === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [batches, busquedaProcesos, filtroTipoProceso, filtroEstadoProceso, ordenProcesos]);

  const pagosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    let lista = pagos.filter((p) => {
      if (termino && !(p.beneficiario ?? "").toLowerCase().includes(termino)) return false;
      if (filtroEstado === "pendiente" && p.estado_pago === "pagado") return false;
      if (filtroEstado === "pagado" && p.estado_pago !== "pagado") return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      let cmp = 0;
      if (orden.campo === "fila") cmp = (a.fila ?? 0) - (b.fila ?? 0);
      else if (orden.campo === "monto") cmp = Number(a.monto) - Number(b.monto);
      else cmp = (a.beneficiario ?? "").localeCompare(b.beneficiario ?? "");
      return orden.dir === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [pagos, busqueda, filtroEstado, orden]);

  const pagosSeleccionados = pagos.filter((p) => seleccionados.has(p.id));
  const montoSeleccionado = pagosSeleccionados.reduce((s, p) => s + Number(p.monto), 0);
  const todosSeleccionados =
    pagosFiltrados.length > 0 && pagosFiltrados.every((p) => seleccionados.has(p.id));
  const puedeGenerar = pagosSeleccionados.length > 0 && !trabajando;

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
    setBusqueda("");
    setFiltroEstado("todos");
    setOrden({ campo: "fila", dir: "asc" });
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
    setSeleccionados(new Set(payList.map((p) => p.id)));
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
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosSeleccionados) {
        for (const p of pagosFiltrados) next.delete(p.id);
      } else {
        for (const p of pagosFiltrados) next.add(p.id);
      }
      return next;
    });
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

      const { zip } = await construirZipRecibos(pagosParaRecibo, meta, null);
      descargarZip(zip);

      // Guardar ZIP en Storage
      const zipPath = `${user.id}/${sel.id}_recibos_${base}.zip`;
      await supabase.storage.from("recibos").upload(zipPath, zip, { upsert: true });

      // Upsert registro de recibo en BD (nivel de lote)
      const receiptBase = {
        numero_recibo: base,
        recibo_file_name: `Recibos_${slug(sel.grupo ?? "grupo")}_${base}.zip`,
        recibo_storage_path: zipPath,
        estado_pago: "confirmado",
      };
      if (batchReceipt?.id) {
        await supabase.from("receipts").update(receiptBase).eq("id", batchReceipt.id);
      } else {
        await supabase.from("receipts").insert({
          ...receiptBase,
          batch_id: sel.id,
          user_id: user.id,
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
          Selecciona los pagos realizados y genera los recibos de pago.
        </p>
      </div>

      {!sel ? (
        /* ── LISTA DE PROCESOS ───────────────────────────────────────────────── */
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <input
              type="text"
              value={busquedaProcesos}
              onChange={(e) => setBusquedaProcesos(e.target.value)}
              placeholder="Buscar por nombre de grupo…"
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroTipoProceso}
              onChange={(e) => setFiltroTipoProceso(e.target.value as typeof filtroTipoProceso)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los tipos</option>
              <option value="terceros">Terceros</option>
              <option value="interbancaria">Interbancario</option>
            </select>
            <select
              value={filtroEstadoProceso}
              onChange={(e) => setFiltroEstadoProceso(e.target.value as typeof filtroEstadoProceso)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los estados</option>
              <option value="txt_generado">TXT Generado</option>
              <option value="pagada">Pagada</option>
              <option value="completado">Completado</option>
            </select>
            <select
              value={`${ordenProcesos.campo}_${ordenProcesos.dir}`}
              onChange={(e) => {
                const [campo, dir] = e.target.value.split("_") as ["fecha" | "grupo" | "monto", "asc" | "desc"];
                setOrdenProcesos({ campo, dir });
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fecha_desc">Más recientes primero</option>
              <option value="fecha_asc">Más antiguos primero</option>
              <option value="grupo_asc">Nombre A-Z</option>
              <option value="grupo_desc">Nombre Z-A</option>
              <option value="monto_desc">Monto mayor a menor</option>
              <option value="monto_asc">Monto menor a mayor</option>
            </select>
            {(busquedaProcesos || filtroTipoProceso !== "todos" || filtroEstadoProceso !== "todos") && (
              <button
                onClick={() => {
                  setBusquedaProcesos("");
                  setFiltroTipoProceso("todos");
                  setFiltroEstadoProceso("todos");
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              {batchesFiltrados.length} de {batches.length} procesos
            </span>
          </div>

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
            ) : batchesFiltrados.length === 0 ? (
              <p className="px-5 py-10 text-center text-slate-400">
                Ningún proceso coincide con los filtros.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {batchesFiltrados.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => seleccionar(b)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-800">{b.grupo || "Proceso"}</p>
                        <p className="text-xs text-slate-500">
                          {fmtFechaHora(b.created_at)} · {b.total_registros}{" "}
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

            {/* ── TABLA DE PAGOS ────────────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Selecciona los pagos realizados
              </p>

              {cargandoPagos ? (
                <p className="py-8 text-center text-sm text-slate-400">Cargando pagos…</p>
              ) : pagos.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Este proceso no tiene pagos registrados.
                </p>
              ) : (
                <>
                  {/* Filtros */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por nombre…"
                      className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                    </select>
                    {(busqueda || filtroEstado !== "todos") && (
                      <button
                        onClick={() => {
                          setBusqueda("");
                          setFiltroEstado("todos");
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Limpiar filtros
                      </button>
                    )}
                    <span className="ml-auto text-xs text-slate-400">
                      {pagosFiltrados.length} de {pagos.length} pagos
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left">
                          <th className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={todosSeleccionados}
                              onChange={toggleTodos}
                              disabled={pagosFiltrados.length === 0}
                              title={
                                todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"
                              }
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 disabled:opacity-40"
                            />
                          </th>
                          <th
                            onClick={() => ordenarPor("fila")}
                            className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            # {orden.campo === "fila" && (orden.dir === "asc" ? "↑" : "↓")}
                          </th>
                          <th
                            onClick={() => ordenarPor("beneficiario")}
                            className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            Beneficiario {orden.campo === "beneficiario" && (orden.dir === "asc" ? "↑" : "↓")}
                          </th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 sm:table-cell">
                            Cédula / RNC
                          </th>
                          <th className="hidden px-3 py-2.5 text-xs font-semibold text-slate-500 md:table-cell">
                            Banco
                          </th>
                          <th
                            onClick={() => ordenarPor("monto")}
                            className="cursor-pointer select-none px-3 py-2.5 text-right text-xs font-semibold text-slate-500 hover:text-slate-700"
                          >
                            Monto {orden.campo === "monto" && (orden.dir === "asc" ? "↑" : "↓")}
                          </th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagosFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                              Ningún pago coincide con los filtros.
                            </td>
                          </tr>
                        ) : (
                        pagosFiltrados.map((p) => {
                          const checked = seleccionados.has(p.id);
                          const pagado = p.estado_pago === "pagado";
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
                        })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen de selección */}
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {pagosSeleccionados.length} de {pagos.length} seleccionados
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
