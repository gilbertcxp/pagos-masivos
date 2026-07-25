"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarResueltoReporte, reabrirReporte } from "../_actions/reportes";

type Reporte = {
  id: string;
  tipo: "problema" | "mejora";
  mensaje: string;
  pagina: string | null;
  estado: "pendiente" | "resuelto";
  creado: string;
  autor: string;
};

export default function ListaReportes({ reportes }: { reportes: Reporte[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<"todos" | "pendiente" | "resuelto">("pendiente");
  const [isPending, startTransition] = useTransition();

  const filtrados = reportes.filter((r) => filtro === "todos" || r.estado === filtro);
  const pendientes = reportes.filter((r) => r.estado === "pendiente").length;

  function toggle(id: string, estadoActual: "pendiente" | "resuelto") {
    startTransition(async () => {
      if (estadoActual === "pendiente") await marcarResueltoReporte(id);
      else await reabrirReporte(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pendiente", "resuelto", "todos"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium " +
              (filtro === f ? "bg-blue-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50")
            }
          >
            {f === "pendiente" ? `Pendientes (${pendientes})` : f === "resuelto" ? "Resueltos" : "Todos"}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          No hay reportes en esta categoría.
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                      (r.tipo === "problema" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")
                    }
                  >
                    {r.tipo === "problema" ? "⚠ Problema" : "💡 Mejora"}
                  </span>
                  <span
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                      (r.estado === "pendiente" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    {r.estado === "pendiente" ? "Pendiente" : "Resuelto"}
                  </span>
                </div>
                <button
                  disabled={isPending}
                  onClick={() => toggle(r.id, r.estado)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {r.estado === "pendiente" ? "Marcar como resuelto" : "Reabrir"}
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-800">{r.mensaje}</p>

              <p className="mt-3 text-xs text-slate-400">
                {r.autor} · {r.creado}
                {r.pagina ? ` · ${r.pagina}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
