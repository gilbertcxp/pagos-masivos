"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  publicarSolicitud,
  devolverSolicitud,
  marcarPagada,
  cancelarSolicitud,
} from "../_actions/flujo";

export default function BotonesFlujo({
  batchId,
  estado,
  mostrarPublicar,
  mostrarGestionar,
  mostrarCancelar,
  contexto,
  txtStoragePath,
  grupo,
  tipoPago,
}: {
  batchId: string;
  estado: string;
  mostrarPublicar: boolean;
  mostrarGestionar: boolean;
  mostrarCancelar: boolean;
  contexto: "contratos" | "contabilidad";
  txtStoragePath: string | null;
  grupo: string | null;
  tipoPago: string | null;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [modalDevolver, setModalDevolver] = useState(false);
  const [motivo, setMotivo] = useState("");

  function ejecutar(fn: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      }
    });
  }

  async function descargarTxt() {
    if (!txtStoragePath) return;
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("txt-generados")
      .createSignedUrl(txtStoragePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const hayAcciones = mostrarPublicar || mostrarGestionar || mostrarCancelar || txtStoragePath;
  if (!hayAcciones) return null;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {mostrarPublicar && (
          <button
            disabled={pendiente}
            onClick={() => ejecutar(() => publicarSolicitud(batchId))}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {estado === "devuelta" ? "Volver a publicar" : "Publicar solicitud"}
          </button>
        )}

        {mostrarGestionar && contexto === "contabilidad" && (
          <>
            {(estado === "publicada" || estado === "en_revision") && (
              <Link
                href={`/dashboard/generar?batch=${batchId}`}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Generar TXT
              </Link>
            )}
            {(estado === "publicada" || estado === "en_revision") && (
              <button
                onClick={() => setModalDevolver(true)}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Devolver a Contratos
              </button>
            )}
            {estado === "txt_generado" && (
              <button
                disabled={pendiente}
                onClick={() => ejecutar(() => marcarPagada(batchId))}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Marcar como pagada
              </button>
            )}
          </>
        )}

        {txtStoragePath && (
          <button
            onClick={descargarTxt}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ⬇ Descargar TXT
          </button>
        )}

        {mostrarCancelar && (estado === "borrador" || estado === "publicada" || estado === "en_revision") && (
          <button
            disabled={pendiente}
            onClick={() => {
              if (!confirm("¿Cancelar esta solicitud? Esta acción quedará en el historial.")) return;
              ejecutar(() => cancelarSolicitud(batchId));
            }}
            className="ml-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar solicitud
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Modal Devolver */}
      {modalDevolver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setModalDevolver(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Devolver a Contratos</h3>
            <p className="mt-1 text-sm text-slate-500">Explica el motivo para que Contratos pueda corregirla.</p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Ej: La cuenta de Juan Julio parece incorrecta, verificar con el proveedor."
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500"
            />
            {/* Sugerencia mínima ~5 caracteres para no bloquear con motivos breves como "duplicado" */}
            {motivo.length > 0 && motivo.trim().length < 5 && (
              <p className="mt-1 text-xs text-red-600">Indica al menos 5 caracteres.</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModalDevolver(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button
                disabled={pendiente || motivo.trim().length < 5}
                onClick={() => {
                  const m = motivo;
                  setModalDevolver(false);
                  setMotivo("");
                  ejecutar(() => devolverSolicitud(batchId, m));
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                Confirmar devolución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info del grupo/tipo (referencia) */}
      {grupo && tipoPago && (
        <p className="mt-3 text-xs text-slate-400">Grupo: {grupo} · Tipo previsto: {tipoPago}</p>
      )}
    </>
  );
}
