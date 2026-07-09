"use client";

import { useState, useTransition } from "react";
import { actualizarRol, actualizarNombrePersonal } from "./_actions";

const ROLES = [
  { valor: "administrador", label: "Administrador" },
  { valor: "contratos", label: "Contratos" },
  { valor: "contabilidad", label: "Contabilidad" },
  { valor: "usuario", label: "Usuario" },
];

export default function FilaUsuario({
  id,
  nombre,
  nombrePersonal,
  correo,
  rol,
  esYo,
}: {
  id: string;
  nombre: string;
  nombrePersonal: string;
  correo: string;
  rol: string;
  esYo: boolean;
}) {
  const [rolActual, setRolActual] = useState(rol);
  const [npActual, setNpActual] = useState(nombrePersonal);
  const [npEdit, setNpEdit] = useState(nombrePersonal);
  const [editando, setEditando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function cambiarRol(nuevo: string) {
    if (nuevo === rolActual) return;
    setMsg("");
    startTransition(async () => {
      try {
        await actualizarRol(id, nuevo);
        setRolActual(nuevo);
        setMsg("Actualizado ✓");
        setTimeout(() => setMsg(""), 2000);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Error");
      }
    });
  }

  function guardarNombre() {
    startTransition(async () => {
      try {
        await actualizarNombrePersonal(id, npEdit);
        setNpActual(npEdit);
        setEditando(false);
        setMsg("Nombre guardado ✓");
        setTimeout(() => setMsg(""), 2000);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        {editando ? (
          <div className="flex items-center gap-2">
            <input
              value={npEdit}
              onChange={(e) => setNpEdit(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500 w-40"
              placeholder="Nombre personal"
              autoFocus
            />
            <button
              onClick={guardarNombre}
              disabled={pendiente}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              onClick={() => { setNpEdit(npActual); setEditando(false); }}
              className="text-xs text-slate-400 hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div>
              <p className="font-medium text-slate-800">
                {npActual || <span className="text-slate-400 italic">Sin nombre personal</span>}
                {esYo && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
              </p>
              <p className="text-xs text-slate-500">{correo}</p>
              <p className="text-xs text-slate-400">{nombre}</p>
            </div>
            <button
              onClick={() => setEditando(true)}
              className="ml-1 text-xs text-blue-500 hover:underline"
              title="Editar nombre personal"
            >
              ✏
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          value={rolActual}
          onChange={(e) => cambiarRol(e.target.value)}
          disabled={pendiente || esYo}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>{r.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{msg}</td>
    </tr>
  );
}
