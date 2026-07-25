"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { crearReporte } from "../_actions/reportes";

export default function BotonReportar() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"problema" | "mejora">("problema");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [isPending, startTransition] = useTransition();

  function cerrar() {
    setAbierto(false);
    setMensaje("");
    setError("");
    setEnviado(false);
    setTipo("problema");
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Ayuda
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={cerrar}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {enviado ? (
              <div className="py-4 text-center">
                <p className="text-lg font-semibold text-emerald-700">¡Gracias!</p>
                <p className="mt-1 text-sm text-slate-500">Tu reporte fue enviado correctamente.</p>
                <button
                  onClick={cerrar}
                  className="mt-5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-800">Reportar problema o mejora</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Cuéntanos qué encontraste. El equipo revisará tu reporte.
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setTipo("problema")}
                    className={
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium " +
                      (tipo === "problema"
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50")
                    }
                  >
                    ⚠ Problema
                  </button>
                  <button
                    onClick={() => setTipo("mejora")}
                    className={
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium " +
                      (tipo === "mejora"
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50")
                    }
                  >
                    💡 Mejora
                  </button>
                </div>

                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={4}
                  placeholder={
                    tipo === "problema"
                      ? "Describe el problema que encontraste…"
                      : "Describe tu idea o sugerencia…"
                  }
                  className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />

                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={cerrar}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setError("");
                      startTransition(async () => {
                        const resultado = await crearReporte(tipo, mensaje, pathname);
                        if (resultado.ok) {
                          setEnviado(true);
                        } else {
                          setError(resultado.mensaje);
                        }
                      });
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isPending ? "Enviando…" : "Enviar reporte"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
