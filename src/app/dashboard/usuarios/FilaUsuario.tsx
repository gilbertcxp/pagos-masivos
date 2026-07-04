"use client";

import { useState, useTransition } from "react";
import { actualizarRol } from "./_actions";

const ROLES = [
  { valor: "administrador", label: "Administrador" },
  { valor: "contratos", label: "Contratos" },
  { valor: "contabilidad", label: "Contabilidad" },
  { valor: "usuario", label: "Usuario" },
];

export default function FilaUsuario({
  id,
  nombre,
  correo,
  rol,
  esYo,
}: {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  esYo: boolean;
}) {
  const [rolActual, setRolActual] = useState(rol);
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function cambiar(nuevo: string) {
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

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{nombre || "—"} {esYo && <span className="text-xs text-slate-400">(tú)</span>}</p>
        <p className="text-xs text-slate-500">{correo}</p>
      </td>
      <td className="px-4 py-3">
        <select
          value={rolActual}
          onChange={(e) => cambiar(e.target.value)}
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
