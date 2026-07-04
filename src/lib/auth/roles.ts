export type Rol = "administrador" | "contratos" | "contabilidad" | "usuario";

export type Estado =
  | "borrador"
  | "publicada"
  | "en_revision"
  | "devuelta"
  | "txt_generado"
  | "pagada"
  | "cancelada"
  // valores legacy que puedan quedar en BD
  | "pagado"
  | "completado"
  | "anulado";

export const ETIQUETA_ESTADO: Record<Estado, { texto: string; clase: string }> = {
  borrador:     { texto: "Borrador",                clase: "bg-slate-100 text-slate-600 border border-slate-200" },
  publicada:    { texto: "Pendiente de Contabilidad", clase: "bg-amber-100 text-amber-800 border border-amber-200" },
  en_revision:  { texto: "En Revisión",             clase: "bg-sky-100 text-sky-800 border border-sky-200" },
  devuelta:     { texto: "Devuelta para Corrección", clase: "bg-red-100 text-red-800 border border-red-200" },
  txt_generado: { texto: "TXT Generado",            clase: "bg-violet-100 text-violet-800 border border-violet-200" },
  pagada:       { texto: "Pagada",                  clase: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  cancelada:    { texto: "Cancelada",               clase: "bg-slate-200 text-slate-700 border border-slate-300" },
  pagado:       { texto: "Pagada",                  clase: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  completado:   { texto: "Pagada",                  clase: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  anulado:      { texto: "Cancelada",               clase: "bg-slate-200 text-slate-700 border border-slate-300" },
};

export function esAdmin(rol: Rol | null | undefined): boolean {
  return rol === "administrador";
}

export function esContratos(rol: Rol | null | undefined): boolean {
  return rol === "contratos" || esAdmin(rol);
}

export function esContabilidad(rol: Rol | null | undefined): boolean {
  return rol === "contabilidad" || esAdmin(rol);
}

/** ¿Puede el usuario editar el batch/solicitud? (Módulo 1) */
export function puedeEditar(rol: Rol | null | undefined, estado: string, dueño: boolean): boolean {
  if (esAdmin(rol)) return true;
  if (esContabilidad(rol)) return true;
  if (dueño && (estado === "borrador" || estado === "devuelta")) return true;
  return false;
}

/** ¿Puede publicar? (Contratos, sobre sus propios borradores/devueltas) */
export function puedePublicar(rol: Rol | null | undefined, estado: string, dueño: boolean): boolean {
  if (!(esContratos(rol) || esAdmin(rol))) return false;
  if (!dueño && !esAdmin(rol)) return false;
  return estado === "borrador" || estado === "devuelta";
}

/** ¿Puede revisar / devolver / generar TXT / marcar pagada? (Contabilidad) */
export function puedeGestionar(rol: Rol | null | undefined, estado: string): boolean {
  if (!(esContabilidad(rol) || esAdmin(rol))) return false;
  return estado === "publicada" || estado === "en_revision" || estado === "txt_generado";
}
