"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarPago } from "../_actions/flujo";

export default function EliminarPagoBoton({
  paymentId,
  beneficiario,
  monto,
}: {
  paymentId: string;
  beneficiario: string;
  monto: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setModal(true)}
        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Eliminar
      </button>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !isPending && setModal(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">¿Eliminar este pago?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Se eliminará el pago de <strong>{beneficiario}</strong> por <strong>{monto}</strong>. Los totales de la
              solicitud se recalcularán. Esta acción no se puede deshacer.
            </p>
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={isPending}
                onClick={() => setModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setError("");
                  startTransition(async () => {
                    const resultado = await eliminarPago(paymentId);
                    if (resultado.ok) {
                      setModal(false);
                      router.refresh();
                    } else {
                      setError(resultado.mensaje);
                    }
                  });
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? "Eliminando…" : "Eliminar pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
