const TZ = "America/Santo_Domingo";

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-DO", { timeZone: TZ });
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-DO", { timeZone: TZ });
}

export function fmtFechaHoraCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-DO", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  });
}
