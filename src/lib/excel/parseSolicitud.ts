/**
 * Lectura de la plantilla de "Solicitud de Pago de Renta" (UD GROUP).
 *
 * La plantilla trae unas filas de encabezado (empresa, grupo, encargado,
 * fecha), luego una fila de titulos de columna (NO. DE AGENCIA, NOMBRE
 * PROPIETARIO, ...) y despues los pagos, uno por fila.
 *
 * Esta funcion recibe la hoja ya convertida a filas (array de arrays de texto)
 * para no depender de la libreria de Excel y poder probarla facilmente.
 */

export type PagoRow = {
  fila: number; // numero de fila en el Excel (1-based)
  noAgencia: string;
  grupo: string;
  beneficiario: string;
  cedula: string;
  formaPago: string;
  banco: string;
  cuenta: string;
  tipo: string; // AHORRO / CORRIENTE
  monto: number;
  montoTexto: string;
  fechaPago: string;
  descripcion: string;
  tipoPago: "interbancaria" | "terceros";
  errores: string[]; // problemas que impiden generar el pago
  advertencias: string[]; // avisos que no bloquean (ej. posible duplicado)
};

export type MetaSolicitud = {
  empresa: string;
  grupo: string;
  encargado: string;
  fecha: string;
  solicitadoPor: string;
};

export type ParsedSolicitud = {
  meta: MetaSolicitud;
  pagos: PagoRow[];
  columnasFaltantes: string[];
  totalRegistros: number;
  totalConErrores: number;
  montoTotal: number;
  beneficiarios: number;
};

// Columnas que debe traer la plantilla (clave interna -> etiqueta visible)
const COLUMNAS: Record<string, string> = {
  noAgencia: "NO. DE AGENCIA",
  grupo: "GRUPO",
  beneficiario: "NOMBRE PROPIETARIO",
  cedula: "CÉDULA",
  formaPago: "FORMA DE PAGO",
  banco: "BANCO",
  cuenta: "CUENTA BANCARIA",
  tipo: "TIPO",
  monto: "MONTO A PAGAR",
  fechaPago: "FECHA DE PAGO",
  descripcion: "DESCRIPCIÓN",
};

// Columnas imprescindibles para poder generar el pago
const REQUERIDAS = ["beneficiario", "cedula", "banco", "cuenta", "monto"];

const SIN_ACENTO: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N",
};

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => SIN_ACENTO[c] ?? c)
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Elimina caracteres especiales de la descripción; conserva letras, números, acentos y espacios. */
function limpiarDescripcion(valor: unknown): string {
  return String(valor ?? "")
    .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convierte "$ 4,000.00" o 4000 en el numero 4000. */
export function parseMonto(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const limpio = String(valor ?? "")
    .replace(/[^0-9.,-]/g, "") // dejar solo digitos , . -
    .replace(/,/g, ""); // quitar separador de miles
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

/** Detecta si el banco destino es Banreservas (terceros) u otro (interbancaria). */
export function detectarTipoPago(banco: string): "interbancaria" | "terceros" {
  const b = normalizar(banco);
  return b.includes("RESERVA") ? "terceros" : "interbancaria";
}

export function parseSolicitudRows(rows: unknown[][]): ParsedSolicitud {
  const meta: MetaSolicitud = {
    empresa: "",
    grupo: "",
    encargado: "",
    fecha: "",
    solicitadoPor: "",
  };

  // 1) Extraer metadatos del encabezado (primeras filas y pie)
  for (let r = 0; r < rows.length; r++) {
    const celdas = rows[r] ?? [];
    for (let c = 0; c < celdas.length; c++) {
      const t = String(celdas[c] ?? "").trim();
      const n = normalizar(t);
      if (n.startsWith("GRUPO:")) meta.grupo = t.split(":").slice(1).join(":").trim();
      else if (n.startsWith("ENCARGADO:")) meta.encargado = t.split(":").slice(1).join(":").trim();
      else if (n.startsWith("FECHA:")) meta.fecha = t.split(":").slice(1).join(":").trim();
      else if (n.includes("UD GROUP") || n.includes("DOMINICANA")) meta.empresa = t;
      else if (n.startsWith("SOLICITADO POR")) {
        // el nombre suele estar en la celda siguiente o tras los dos puntos
        const inline = t.split(":").slice(1).join(":").trim();
        meta.solicitadoPor = inline || String(celdas[c + 1] ?? "").trim();
      }
    }
  }

  // 2) Encontrar la fila de titulos (la que contiene "NOMBRE PROPIETARIO")
  let filaTitulos = -1;
  for (let r = 0; r < rows.length; r++) {
    const celdas = (rows[r] ?? []).map(normalizar);
    if (celdas.some((c) => c.includes("NOMBRE PROPIETARIO"))) {
      filaTitulos = r;
      break;
    }
  }

  if (filaTitulos === -1) {
    return {
      meta,
      pagos: [],
      columnasFaltantes: Object.values(COLUMNAS),
      totalRegistros: 0,
      totalConErrores: 0,
      montoTotal: 0,
      beneficiarios: 0,
    };
  }

  // 3) Mapear clave interna -> indice de columna, usando los titulos
  const titulos = (rows[filaTitulos] ?? []).map(normalizar);
  const indice: Record<string, number> = {};
  for (const [clave, etiqueta] of Object.entries(COLUMNAS)) {
    const objetivo = normalizar(etiqueta);
    const idx = titulos.findIndex((t) => t === objetivo || t.includes(objetivo));
    if (idx !== -1) indice[clave] = idx;
  }

  const columnasFaltantes = Object.entries(COLUMNAS)
    .filter(([clave]) => indice[clave] === undefined)
    .map(([, etiqueta]) => etiqueta);

  // 4) Leer los pagos (desde la fila siguiente a los titulos)
  const get = (row: unknown[], clave: string) => {
    const i = indice[clave];
    return i === undefined ? "" : String(row?.[i] ?? "").trim();
  };

  const pagos: PagoRow[] = [];

  for (let r = filaTitulos + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];

    // Fin de los datos: al llegar al pie (firmas/totales) dejamos de leer.
    const textoFila = (row ?? []).map((c) => normalizar(c)).join(" ");
    if (textoFila.includes("SOLICITADO POR") || textoFila.includes("AUTORIZADO POR")) {
      break;
    }

    const beneficiario = get(row, "beneficiario");
    const cuenta = get(row, "cuenta");
    const montoTexto = get(row, "monto");

    // Solo es un pago si trae beneficiario o cuenta. Filas vacias, separadores
    // ("-") o de totales (monto sin beneficiario) se ignoran.
    if (!beneficiario && !cuenta) continue;

    const banco = get(row, "banco");
    const cedula = get(row, "cedula");
    const monto = parseMonto(montoTexto);

    const errores: string[] = [];
    if (!beneficiario) errores.push("Falta el nombre del propietario");
    if (!cedula) errores.push("Falta la cédula/RNC");
    if (!banco) errores.push("Falta el banco");
    if (!cuenta) errores.push("Falta la cuenta bancaria");
    else if (!/^[0-9-]+$/.test(cuenta)) errores.push("Cuenta con caracteres inválidos");
    if (monto <= 0) errores.push("Monto inválido o en cero");

    pagos.push({
      fila: r + 1,
      noAgencia: get(row, "noAgencia"),
      grupo: get(row, "grupo"),
      beneficiario,
      cedula,
      formaPago: get(row, "formaPago"),
      banco,
      cuenta,
      tipo: get(row, "tipo"),
      monto,
      montoTexto,
      fechaPago: get(row, "fechaPago"),
      descripcion: limpiarDescripcion(get(row, "descripcion")),
      tipoPago: detectarTipoPago(banco),
      errores,
      advertencias: [],
    });
  }

  // 5) Avisar (sin bloquear) filas EXACTAMENTE repetidas: mismo beneficiario,
  // cuenta y monto. Pagar varias veces a una misma cuenta es valido (un dueno
  // con varios locales), asi que solo avisamos del duplicado exacto.
  const clave = (p: PagoRow) =>
    `${normalizar(p.beneficiario)}|${p.cuenta}|${p.monto}`;
  const conteo = new Map<string, number>();
  for (const p of pagos) conteo.set(clave(p), (conteo.get(clave(p)) ?? 0) + 1);
  for (const p of pagos) {
    if ((conteo.get(clave(p)) ?? 0) > 1) {
      p.advertencias.push("Fila repetida (mismo beneficiario, cuenta y monto)");
    }
  }

  const montoTotal = pagos.reduce((s, p) => s + p.monto, 0);
  const beneficiarios = new Set(pagos.map((p) => p.cuenta).filter(Boolean)).size;

  return {
    meta,
    pagos,
    columnasFaltantes: columnasFaltantes.filter((c) =>
      REQUERIDAS.some((req) => normalizar(COLUMNAS[req]) === normalizar(c)),
    ),
    totalRegistros: pagos.length,
    totalConErrores: pagos.filter((p) => p.errores.length > 0).length,
    montoTotal,
    beneficiarios,
  };
}
