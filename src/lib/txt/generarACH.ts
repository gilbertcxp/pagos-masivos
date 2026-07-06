/**
 * Generador del archivo TXT de PAGOS INTERBANCARIOS ACH (RED ACH dominicana).
 *
 * Formato: separado por comas, una linea por pago, 11 campos:
 *   1.  Tipo cuenta origen (CA/CC)          max 2
 *   2.  Moneda origen (DOP)                 max 3
 *   3.  Numero cuenta origen                max 10
 *   4.  Codigo Ruta y Transito del banco    8 digitos
 *   5.  Tipo cuenta destino (CA/CC)         max 2
 *   6.  Numero cuenta destino               max 15
 *   7.  Monto                               max 13 (2 decimales)
 *   8.  Nombre beneficiario                 max 21, sin acentos
 *   9.  Tipo identificacion (Cedula/RNC/Pasaporte)
 *   10. Numero identificacion               sin guiones ni espacios
 *   11. Descripcion                         max 55, sin comas
 *
 * Ejemplo:
 *   CA,DOP,2400986050,10101300,CA,9600986030,50000.00,Noel Paredes,Cedula,22300685561,Pago renta julio
 */

import type { PagoRow } from "../excel/parseSolicitud";
import { tipoCuentaDestino, limpiarDescripcion, type ConfigOrigen, type ResultadoTxt } from "./generarTerceros";

// ─────────────────────────────────────────────────────
// Tabla de codigos ACH (Ruta y Transito RED ACH RD)
// Fuente: Relacion Ruta y Transito Instituciones Miembros
// ─────────────────────────────────────────────────────
const BANCOS_ACH: Array<{ keywords: string[]; codigo: string; nombre: string }> = [
  { keywords: ["popular"],                     codigo: "10101070", nombre: "Banco Popular"              },
  { keywords: ["bhd"],                         codigo: "10101230", nombre: "Banco BHD"                  },
  { keywords: ["progreso"],                    codigo: "10101110", nombre: "Banco del Progreso"          },
  { keywords: ["reservas", "banreservas"],     codigo: "10101010", nombre: "Banco de Reservas"           },
  { keywords: ["leon", "león"],                codigo: "10101370", nombre: "Banco León"                  },
  { keywords: ["santa cruz", "santacruz"],     codigo: "10101340", nombre: "Banco Santa Cruz"            },
  { keywords: ["citi"],                        codigo: "10101060", nombre: "Citibank"                    },
  { keywords: ["scotiabank", "scotia"],        codigo: "10101030", nombre: "Scotiabank"                  },
  { keywords: ["bdi"],                         codigo: "10101360", nombre: "Banco BDI"                   },
  { keywords: ["lopez de haro", "haro"],       codigo: "10101390", nombre: "Banco López de Haro"         },
  { keywords: ["promerica"],                   codigo: "44405900", nombre: "Banco Promerica"             },
  { keywords: ["vimenca"],                     codigo: "10101380", nombre: "Banco Vimenca"               },
  { keywords: ["caribe"],                      codigo: "10101350", nombre: "Banco Caribe"                },
  { keywords: ["cibao"],                       codigo: "48991200", nombre: "Asoc. Cibao"                 },
  { keywords: ["americas", "américas"],        codigo: "10171228", nombre: "Banco de las Américas"       },
  { keywords: ["banesco"],                     codigo: "11102328", nombre: "Banesco"                     },
  { keywords: ["ademi"],                       codigo: "10101300", nombre: "Ademi"                       },
  { keywords: ["nacional"],                    codigo: "10231034", nombre: "Asoc. La Nacional"           },
  { keywords: ["peravia"],                     codigo: "25141012", nombre: "Banco Peravia"               },
  { keywords: ["lafise"],                      codigo: "11121214", nombre: "Banco Múltiple Lafise"       },
  { keywords: ["providencial"],                codigo: "10171225", nombre: "Banco Providencial"          },
  { keywords: ["empire"],                      codigo: "10172714", nombre: "Banco Empire"                },
  { keywords: ["bellbank", "bell bank"],       codigo: "11142133", nombre: "Bellbank"                    },
  { keywords: ["atlantico", "atlántico"],      codigo: "11101012", nombre: "Banco Atlántico"             },
  { keywords: ["union", "unión"],              codigo: "30232423", nombre: "Banco Unión"                 },
  { keywords: ["federal"],                     codigo: "10171214", nombre: "Banco Ahorro y Crédito Fed." },
  { keywords: ["asoc popular"],               codigo: "47940900", nombre: "Asoc. Popular"               },
];

function normTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Busca el codigo ACH a partir del nombre del banco en el Excel. */
export function buscarCodigoACH(banco: string): string {
  const n = normTexto(banco);
  for (const b of BANCOS_ACH) {
    if (b.keywords.some((k) => n.includes(normTexto(k)))) return b.codigo;
  }
  return "";
}

/** Nombre del banco a partir del codigo ACH (para mostrar en UI). */
export function nombrePorCodigoACH(codigo: string): string {
  return BANCOS_ACH.find((b) => b.codigo === codigo)?.nombre ?? codigo;
}

/** Lista de bancos con su codigo para la tabla de configuracion. */
export const LISTA_BANCOS_ACH = BANCOS_ACH.map((b) => ({
  codigo: b.codigo,
  nombre: b.nombre,
})).sort((a, b) => a.nombre.localeCompare(b.nombre));

/** Detecta el tipo de identificacion por longitud. */
export function detectarTipoId(cedula: string): "Cedula" | "RNC" | "Pasaporte" {
  const limpia = cedula.replace(/[-\s.]/g, "");
  if (limpia.length === 9) return "RNC";
  return "Cedula";
}

/** Limpia y trunca el nombre a 21 caracteres sin acentos. */
export function limpiarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 21);
}

/** Limpia la identificacion: solo digitos. */
export function limpiarIdentificacion(cedula: string): string {
  return cedula.replace(/[^0-9]/g, "");
}

export type ValidacionACH = { valido: boolean; errores: string[] };

export function validarPagoACH(pago: PagoRow): string[] {
  const errores: string[] = [];
  if (!pago.cuenta) errores.push("Falta número de cuenta destino");
  if (!pago.tipo) errores.push("Falta tipo de cuenta (AHORRO/CORRIENTE)");
  if (pago.monto <= 0) errores.push("Monto inválido");
  if (!pago.beneficiario) errores.push("Falta nombre del beneficiario");
  if (!pago.cedula) errores.push("Falta cédula/RNC");
  const codigo = buscarCodigoACH(pago.banco);
  if (!codigo) errores.push(`Banco no reconocido para ACH: "${pago.banco}"`);
  return errores;
}

export function generarLineaACH(pago: PagoRow, origen: ConfigOrigen, descripcion: string): string {
  const codigo = buscarCodigoACH(pago.banco);
  const idLimpia = limpiarIdentificacion(pago.cedula);
  const tipoId = detectarTipoId(idLimpia);
  return [
    origen.tipoCuenta,
    origen.moneda || "DOP",
    origen.numeroCuenta,
    codigo,
    tipoCuentaDestino(pago.tipo),
    pago.cuenta,
    pago.monto.toFixed(2),
    limpiarNombre(pago.beneficiario),
    tipoId,
    idLimpia,
    limpiarDescripcion(descripcion),
  ].join(",");
}

/**
 * Genera el TXT ACH a partir de los pagos interbancarios de una solicitud.
 * Solo incluye los pagos con tipoPago === "interbancaria".
 */
export function generarTxtACH(
  pagos: PagoRow[],
  origen: ConfigOrigen,
  opciones: { descripcionDesde: "nombre" | "descripcion" } = { descripcionDesde: "descripcion" },
): ResultadoTxt {
  const lineas: string[] = [];
  const omitidos: ResultadoTxt["omitidos"] = [];
  let montoTotal = 0;

  for (const p of pagos) {
    if (p.tipoPago !== "interbancaria") {
      omitidos.push({ fila: p.fila, beneficiario: p.beneficiario, motivo: "Es Banreservas (va en Terceros)" });
      continue;
    }
    const errs = validarPagoACH(p);
    if (errs.length) {
      omitidos.push({ fila: p.fila, beneficiario: p.beneficiario, motivo: errs.join("; ") });
      continue;
    }
    const desc = opciones.descripcionDesde === "nombre" ? p.beneficiario : p.descripcion;
    lineas.push(generarLineaACH(p, origen, desc));
    montoTotal += p.monto;
  }

  return {
    contenido: lineas.join("\r\n"),
    incluidos: lineas.length,
    montoTotal,
    omitidos,
  };
}
