"use client";

import { useState } from "react";
import { responderDevolucion } from "@/app/dashboard/_actions/flujo";

export default function RespuestaDevolucion({
  batchId,
  motivoDevolucion,
  respuestaActual,
  puedeResponder,
}: {
  batchId: string;
  motivoDevolucion: string;
  respuestaActual: string | null;
  puedeResponder: boolean;
}) {
  const [respuesta, setRespuesta] = useState(respuestaActual ?? "");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  async function enviar() {
    if (!respuesta.trim()) return;
    setEnviando(true);
    await responderDevolucion(batchId, respuesta.trim());
    setOk(true);
    setEnviando(false);
  }

  return (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-red-800">Motivo de la devolución</p>
        <p className="mt-1 text-sm text-red-700">{motivoDevolucion}</p>
      </div>

      {respuestaActual && !puedeResponder && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-800">Respuesta de Contratos</p>
          <p className="mt-1 text-sm text-emerald-700">{respuestaActual}</p>
        </div>
      )}

      {puedeResponder && (
        <div className="space-y-2 border-t border-red-200 pt-3">
          <p className="text-xs font-medium text-red-800">Tu respuesta a Contabilidad</p>
          {ok && (
            <p className="text-xs text-emerald-700 font-medium">✓ Respuesta enviada.</p>
          )}
          <textarea
            value={respuesta}
            onChange={(e) => { setRespuesta(e.target.value); setOk(false); }}
            rows={3}
            placeholder="Escribe tu respuesta o aclaración…"
            className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 resize-none"
          />
          <button
            onClick={enviar}
            disabled={enviando || !respuesta.trim()}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando ? "Enviando…" : "Enviar respuesta"}
          </button>
        </div>
      )}
    </div>
  );
}
