/**
 * Consolida en una sola linea los pagos de un mismo beneficiario (misma
 * cuenta bancaria) dentro de una solicitud. Se usa antes de generar el TXT:
 * si un beneficiario aparece varias veces, se suma el monto y se usa como
 * descripcion el nombre del archivo Excel cargado (sin extension).
 */

import type { PagoRow } from "../excel/parseSolicitud";
import { limpiarCuenta } from "./generarTerceros";

export function quitarExtension(nombreArchivo: string): string {
  return String(nombreArchivo ?? "").replace(/\.(xlsx|xls|csv)$/i, "").trim();
}

export function consolidarPorCuenta(pagos: PagoRow[], descripcionConsolidado: string): PagoRow[] {
  const grupos = new Map<string, PagoRow[]>();

  for (const p of pagos) {
    const cuentaLimpia = limpiarCuenta(p.cuenta);
    const clave = cuentaLimpia ? cuentaLimpia : `__sin_cuenta_${p.fila}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(p);
    grupos.set(clave, lista);
  }

  const resultado: PagoRow[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) {
      resultado.push(grupo[0]);
      continue;
    }
    const base = grupo[0];
    const montoTotal = grupo.reduce((s, p) => s + p.monto, 0);
    resultado.push({
      ...base,
      monto: montoTotal,
      montoTexto: montoTotal.toFixed(2),
      descripcion: descripcionConsolidado,
      advertencias: [...base.advertencias, `Consolidado: ${grupo.length} pagos al mismo beneficiario`],
    });
  }
  return resultado;
}
