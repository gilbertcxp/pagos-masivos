/**
 * Generador del archivo TXT de PAGOS A TERCEROS (Banreservas).
 *
 * Formato: separado por comas, una linea por pago, 8 campos:
 *   1. Tipo cuenta origen (CA/CC)      max 2
 *   2. Moneda origen (DOP)             max 3
 *   3. Numero cuenta origen            max 10, numerico
 *   4. Tipo cuenta destino (CA/CC)     max 2
 *   5. Moneda destino (DOP)            max 3
 *   6. Numero cuenta destino           max 10, numerico
 *   7. Monto (decimal, punto)          max 13
 *   8. Descripcion                     max 55, alfanumerico
 *
 * Ejemplo:
 *   CC,DOP,9600882715,CA,DOP,9608941885,26483.67,Alexa Lora Lopez
 */

import type { PagoRow } from "../excel/parseSolicitud";

export type ConfigOrigen = {
  tipoCuenta: "CA" | "CC";
  moneda: string; // por ahora siempre "DOP"
  numeroCuenta: string;
};

export type OpcionesTxt = {
  /** Que va en el campo 8: el nombre del beneficiario o la columna descripcion. */
  descripcionDesde: "nombre" | "descripcion";
};

const MAX_DESC = 55;

/** Convierte el TIPO del Excel (AHORRO/CORRIENTE) al codigo del banco (CA/CC). */
export function tipoCuentaDestino(tipoExcel: string): "CA" | "CC" {
  const t = String(tipoExcel ?? "").toUpperCase();
  if (t.includes("CORRIENTE") || t === "CC") return "CC";
  return "CA"; // AHORRO u otros -> CA
}

/** Elimina todo lo que no sea dígito del número de cuenta. */
export function limpiarCuenta(cuenta: string): string {
  return String(cuenta ?? "").replace(/[^0-9]/g, "");
}

/** Limpia la descripcion: sin comas (romperian el CSV), sin dobles espacios, cortada a 55. */
export function limpiarDescripcion(texto: string, max = MAX_DESC): string {
  return String(texto ?? "")
    .replace(/,/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Valida los campos que exige el TXT de terceros para un pago concreto. */
export function validarPagoTerceros(pago: PagoRow): string[] {
  const errores: string[] = [];
  const cuentaLimpia = limpiarCuenta(pago.cuenta);
  if (!cuentaLimpia) errores.push("Falta la cuenta destino");
  else if (cuentaLimpia.length > 10)
    errores.push("La cuenta destino excede 10 dígitos");
  if (!pago.tipo) errores.push("Falta el tipo de cuenta (AHORRO/CORRIENTE)");
  if (pago.monto <= 0) errores.push("Monto inválido");
  return errores;
}

export function generarLineaTerceros(
  pago: PagoRow,
  origen: ConfigOrigen,
  descripcion: string,
): string {
  return [
    origen.tipoCuenta,
    origen.moneda || "DOP",
    origen.numeroCuenta,
    tipoCuentaDestino(pago.tipo),
    "DOP",
    limpiarCuenta(pago.cuenta),
    pago.monto.toFixed(2),
    limpiarDescripcion(descripcion),
  ].join(",");
}

export type ResultadoTxt = {
  contenido: string;
  incluidos: number;
  montoTotal: number;
  omitidos: { fila: number; beneficiario: string; motivo: string }[];
};

/**
 * Genera el TXT de terceros a partir de los pagos de una solicitud.
 * Solo incluye los pagos cuyo destino es Banreservas (tipoPago === "terceros")
 * y que pasan la validacion. Los demas se reportan en `omitidos`.
 */
export function generarTxtTerceros(
  pagos: PagoRow[],
  origen: ConfigOrigen,
  opciones: OpcionesTxt,
): ResultadoTxt {
  const lineas: string[] = [];
  const omitidos: ResultadoTxt["omitidos"] = [];
  let montoTotal = 0;

  for (const p of pagos) {
    if (p.tipoPago !== "terceros") {
      omitidos.push({ fila: p.fila, beneficiario: p.beneficiario, motivo: "No es Banreservas (va en interbancaria)" });
      continue;
    }
    const errs = validarPagoTerceros(p);
    if (errs.length) {
      omitidos.push({ fila: p.fila, beneficiario: p.beneficiario, motivo: errs.join("; ") });
      continue;
    }
    const desc = opciones.descripcionDesde === "nombre" ? p.beneficiario : p.descripcion;
    lineas.push(generarLineaTerceros(p, origen, desc));
    montoTotal += p.monto;
  }

  return {
    contenido: lineas.join("\r\n"),
    incluidos: lineas.length,
    montoTotal,
    omitidos,
  };
}
