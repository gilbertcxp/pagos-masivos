"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ETIQUETA_ESTADO, type Estado } from "@/lib/auth/roles";
import { fmtFecha } from "@/lib/fecha";

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
            return (
              <li key={b.id}>
                <Link href={`/dashboard/contabilidad/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <div>
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
