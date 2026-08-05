"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ETIQUETA_ESTADO, type Estado } from "@/lib/auth/roles";
import { fmtFecha } from "@/lib/fecha";
import { marcarPagada } from "@/app/dashboard/_actions/flujo";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

export type Batch = {
  id: string;
  numero_solicitud: string | null;
  grupo: string | null;
  contrato: string | null;
  estado: string;
  total_registros: number;
  monto_total: number;
  created_at: string;
  published_at: string | null;
  conceptos_pagar: string[] | null;
  profiles: { nombre: string | null; correo: string | null } | { nombre: string | null; correo: string | null }[] | null;
};

type Orden = { campo: "fecha" | "grupo" | "monto"; dir: "asc" | "desc" };

export default function ListaSolicitudes({
  pendientes,
  enRevision,
  devueltas,
  conTxt,
  pagadas,
}: {
  pendientes: Batch[];
  enRevision: Batch[];
  devueltas: Batch[];
  conTxt: Batch[];
  pagadas: Batch[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [orden, setOrden] = useState<Orden>({ campo: "fecha", dir: "desc" });

  const todos = useMemo(
    () => [...pendientes, ...enRevision, ...devueltas, ...conTxt, ...pagadas],
    [pendientes, enRevision, devueltas, conTxt, pagadas],
  );

  const tiposDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const b of todos) {
      if (Array.isArray(b.conceptos_pagar)) for (const c of b.conceptos_pagar) set.add(c);
    }
    return Array.from(set).sort();
  }, [todos]);

  function aplicarFiltro(lista: Batch[]) {
    const termino = busqueda.trim().toLowerCase();
    let out = lista.filter((b) => {
      if (termino) {
        const texto = `${b.numero_solicitud ?? ""} ${b.grupo ?? ""} ${b.contrato ?? ""}`.toLowerCase();
        if (!texto.includes(termino)) return false;
      }
      if (filtroTipo !== "todos") {
        if (!Array.isArray(b.conceptos_pagar) || !b.conceptos_pagar.includes(filtroTipo)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let cmp = 0;
      if (orden.campo === "fecha") {
        cmp = new Date(a.published_at ?? a.created_at).getTime() - new Date(b.published_at ?? b.created_at).getTime();
      } else if (orden.campo === "monto") {
        cmp = Number(a.monto_total) - Number(b.monto_total);
      } else {
        cmp = (a.grupo ?? "").localeCompare(b.grupo ?? "");
      }
      return orden.dir === "asc" ? cmp : -cmp;
    });
    return out;
  }

  const hayFiltrosActivos = busqueda.trim() !== "" || filtroTipo !== "todos";

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por No., grupo o contrato…"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos los tipos</option>
          {tiposDisponibles.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={`${orden.campo}_${orden.dir}`}
          onChange={(e) => {
            const [campo, dir] = e.target.value.split("_") as [Orden["campo"], Orden["dir"]];
            setOrden({ campo, dir });
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
        {hayFiltrosActivos && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroTipo("todos");
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <ListaBatches
        titulo="Pendientes de Contabilidad"
        vacio={hayFiltrosActivos ? "Ningún resultado con estos filtros." : "No hay solicitudes por revisar."}
        batches={aplicarFiltro(pendientes)}
      />
      {enRevision.length > 0 && (
        <ListaBatches titulo="En revisión" vacio="Ningún resultado con estos filtros." batches={aplicarFiltro(enRevision)} />
      )}
      {devueltas.length > 0 && (
        <ListaBatches titulo="Devueltas para corrección" vacio="Ningún resultado con estos filtros." batches={aplicarFiltro(devueltas)} />
      )}
      {conTxt.length > 0 && (
        <ListaBatches titulo="Con TXT generado (por pagar)" vacio="Ningún resultado con estos filtros." batches={aplicarFiltro(conTxt)} />
      )}
      {pagadas.length > 0 && (
        <ListaBatches titulo="Pagadas recientemente" vacio="Ningún resultado con estos filtros." batches={aplicarFiltro(pagadas)} />
      )}
    </div>
  );
}

function ListaBatches({ titulo, vacio, batches }: { titulo: string; vacio: string; batches: Batch[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-800">{titulo}</h2>
      </div>
      {batches.length === 0 ? (
        <p className="px-5 py-10 text-center text-slate-400">{vacio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {batches.map((b) => {
            const est = ETIQUETA_ESTADO[b.estado as Estado] ?? { texto: b.estado, clase: "bg-slate-100" };
            const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
            const nombre = p?.nombre || p?.correo || "—";
            const esTxtGenerado = b.estado === "txt_generado";
            return (
              <li key={b.id} className="flex items-center">
                {/* Toda la info es clickeable hacia el detalle */}
                <Link
                  href={`/dashboard/contabilidad/${b.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{b.numero_solicitud ?? "—"} · {b.grupo || "—"}</p>
                    <p className="text-xs text-slate-500">
                      {b.contrato ? `${b.contrato} · ` : ""}
                      Creada por {nombre} · {fmtFecha(b.published_at ?? b.created_at)}
                    </p>
                    {Array.isArray(b.conceptos_pagar) && b.conceptos_pagar.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {b.conceptos_pagar.map((c) => (
                          <span key={c} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">{b.total_registros} pagos</span>
                    <span className="text-sm font-semibold text-slate-800">{money(Number(b.monto_total))}</span>
                    <span className={"rounded-full px-2.5 py-1 text-xs " + est.clase}>{est.texto}</span>
                  </div>
                </Link>

                {/* Botón Aplicar Pago — solo en filas con TXT generado */}
                {esTxtGenerado && (
                  <div className="flex-shrink-0 pr-4">
                    <AplicarPagoBoton batchId={b.id} numero={b.numero_solicitud ?? b.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Botón inline para aplicar pago desde la lista — solo aparece en solicitudes con TXT generado. */
function AplicarPagoBoton({ batchId, numero }: { batchId: string; numero: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");

  function confirmar(e: React.MouseEvent) {
    e.preventDefault(); // evita que el click propague al Link padre
    setError("");
    setConfirmando(true);
  }

  function cancelar(e: React.MouseEvent) {
    e.preventDefault();
    setConfirmando(false);
  }

  function aplicar(e: React.MouseEvent) {
    e.preventDefault();
    setConfirmando(false);
    startTransition(async () => {
      try {
        await marcarPagada(batchId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al aplicar el pago");
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={confirmar}
        disabled={pendiente}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
      >
        {pendiente ? "Aplicando…" : "✓ Aplicar Pago"}
      </button>

      {error && (
        <p className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 shadow z-10">
          {error}
        </p>
      )}

      {/* Mini modal de confirmación */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={cancelar}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800">¿Aplicar pago?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Esto marcará la solicitud <span className="font-medium text-slate-700">{numero}</span> como <span className="font-medium text-emerald-700">Pagada</span> y actualizará todos sus registros.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={cancelar}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={aplicar}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
