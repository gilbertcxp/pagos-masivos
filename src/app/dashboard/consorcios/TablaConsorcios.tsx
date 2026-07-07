"use client";

import { useState, useTransition } from "react";
import { crearConsorcio, editarConsorcio, eliminarConsorcio } from "./_actions";

type Consorcio = {
  id: string;
  nombre: string;
  numero_cuenta_origen: string;
  tipo_cuenta_origen: string;
};

type Modal =
  | { tipo: "crear" }
  | { tipo: "editar"; consorcio: Consorcio }
  | { tipo: "eliminar"; consorcio: Consorcio }
  | null;

export default function TablaConsorcios({ datos }: { datos: Consorcio[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtrados = datos.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero_cuenta_origen.includes(busqueda),
  );

  function cerrar() {
    setModal(null);
    setError("");
  }

  return (
    <>
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cuenta…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setModal({ tipo: "crear" })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nuevo Consorcio
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Nombre del Consorcio</th>
              <th className="px-4 py-3 text-left font-medium">Número de Cuenta</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {busqueda ? "Sin resultados para esa búsqueda." : "No hay consorcios registrados."}
                </td>
              </tr>
            ) : (
              filtrados.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.nombre}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{c.numero_cuenta_origen}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c.tipo_cuenta_origen === "CA" ? "Ahorros" : "Corriente"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setModal({ tipo: "editar", consorcio: c })}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setModal({ tipo: "eliminar", consorcio: c })}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear / Editar */}
      {(modal?.tipo === "crear" || modal?.tipo === "editar") && (
        <ModalForm
          inicial={modal.tipo === "editar" ? modal.consorcio : undefined}
          error={error}
          isPending={isPending}
          onCancelar={cerrar}
          onGuardar={(nombre, cuenta, tipo) => {
            setError("");
            startTransition(async () => {
              try {
                if (modal.tipo === "crear") {
                  await crearConsorcio(nombre, cuenta, tipo);
                } else {
                  await editarConsorcio(modal.consorcio.id, nombre, cuenta, tipo);
                }
                cerrar();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error al guardar.");
              }
            });
          }}
        />
      )}

      {/* Modal Confirmar Eliminación */}
      {modal?.tipo === "eliminar" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-slate-800">¿Eliminar consorcio?</h2>
            <p className="mb-5 text-sm text-slate-500">
              Se eliminará <strong>{modal.consorcio.nombre}</strong> de forma permanente. Esta acción no se puede deshacer.
            </p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={cerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  setError("");
                  startTransition(async () => {
                    try {
                      await eliminarConsorcio(modal.consorcio.id);
                      cerrar();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error al eliminar.");
                    }
                  });
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ModalForm({
  inicial,
  error,
  isPending,
  onCancelar,
  onGuardar,
}: {
  inicial?: Consorcio;
  error: string;
  isPending: boolean;
  onCancelar: () => void;
  onGuardar: (nombre: string, cuenta: string, tipo: "CA" | "CC") => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [cuenta, setCuenta] = useState(inicial?.numero_cuenta_origen ?? "");
  const [tipo, setTipo] = useState<"CA" | "CC">(
    (inicial?.tipo_cuenta_origen as "CA" | "CC") ?? "CC",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-5 text-lg font-bold text-slate-800">
          {inicial ? "Editar Consorcio" : "Nuevo Consorcio"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Nombre del Consorcio <span className="text-red-500">*</span>
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="UD GROUP DOMINICANA"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Número de Cuenta Bancaria <span className="text-red-500">*</span>
            </label>
            <input
              value={cuenta}
              onChange={(e) => setCuenta(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              placeholder="9600000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-400">Solo dígitos, máximo 10.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Tipo de Cuenta
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "CA" | "CC")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="CC">Corriente (CC)</option>
              <option value="CA">Ahorros (CA)</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            disabled={isPending}
            onClick={() => onGuardar(nombre, cuenta, tipo)}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
