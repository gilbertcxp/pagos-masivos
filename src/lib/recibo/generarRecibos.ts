/**
 * Genera un recibo de pago en PDF por CADA transacción y los empaqueta en
 * un archivo ZIP. Se usa en el navegador (jsPDF + JSZip).
 *
 * Diseño estilo "La Primera": encabezado rojo, No. de recibo, filas con
 * íconos y separadores, y recuadro del monto.
 */
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const slug = (s: string) =>
  (s || "beneficiario").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

// Paleta
const ROJO: [number, number, number] = [227, 20, 35];
const NEGRO: [number, number, number] = [17, 24, 39];
const GRIS: [number, number, number] = [107, 114, 128];
const LINEA: [number, number, number] = [235, 238, 242];
const ROJO_SUAVE: [number, number, number] = [254, 235, 236];

const ESTADO_COLOR: Record<string, [number, number, number]> = {
  confirmado: [22, 163, 74],
  pendiente: [234, 88, 12],
  rechazado: [220, 38, 38],
};

export type PagoRecibo = {
  beneficiario: string;
  cedula: string;
  banco: string;
  cuenta: string;
  tipoCuenta: string;
  monto: number;
  concepto: string;
};

export type MetaRecibo = {
  empresa: string;
  grupo: string;
  tipoPago: string;
  fecha: string;
  hora: string;
  estadoPago: string;
  comprobante: string;
  usuario: string;
  baseNumero: string; // ej: REC-2026-0003
  logoDataUrl?: string; // logo opcional (PNG en dataURL)
};

/** Dibuja un ícono simple en rojo centrado en (cx, cy). */
function icono(doc: jsPDF, nombre: string, cx: number, cy: number) {
  doc.setDrawColor(...ROJO);
  doc.setFillColor(...ROJO);
  doc.setLineWidth(0.4);
  const r = 2;
  switch (nombre) {
    case "persona":
      doc.circle(cx, cy - 1.5, 1.3, "S");
      doc.line(cx - 2, cy + 2.2, cx + 2, cy + 2.2);
      doc.line(cx - 2, cy + 2.2, cx - 1.4, cy + 0.4);
      doc.line(cx + 2, cy + 2.2, cx + 1.4, cy + 0.4);
      break;
    case "id":
      doc.roundedRect(cx - 2.6, cy - 1.8, 5.2, 3.6, 0.4, 0.4, "S");
      doc.circle(cx - 1.2, cy - 0.2, 0.7, "S");
      doc.line(cx + 0.2, cy - 0.8, cx + 1.8, cy - 0.8);
      doc.line(cx + 0.2, cy + 0.4, cx + 1.8, cy + 0.4);
      break;
    case "banco":
      doc.line(cx - 2.6, cy - 1.4, cx, cy - 2.6);
      doc.line(cx, cy - 2.6, cx + 2.6, cy - 1.4);
      doc.line(cx - 2.2, cy + 2, cx + 2.2, cy + 2);
      doc.line(cx - 1.6, cy - 1, cx - 1.6, cy + 1.4);
      doc.line(cx, cy - 1, cx, cy + 1.4);
      doc.line(cx + 1.6, cy - 1, cx + 1.6, cy + 1.4);
      break;
    case "tarjeta":
      doc.roundedRect(cx - 2.8, cy - 1.8, 5.6, 3.6, 0.5, 0.5, "S");
      doc.line(cx - 2.8, cy - 0.4, cx + 2.8, cy - 0.4);
      break;
    case "doc":
      doc.line(cx - 1.8, cy - 2.4, cx + 1, cy - 2.4);
      doc.line(cx + 1, cy - 2.4, cx + 2, cy - 1.4);
      doc.line(cx + 2, cy - 1.4, cx + 2, cy + 2.4);
      doc.line(cx + 2, cy + 2.4, cx - 1.8, cy + 2.4);
      doc.line(cx - 1.8, cy + 2.4, cx - 1.8, cy - 2.4);
      break;
    case "grupo":
      doc.circle(cx - 1.4, cy - 1, 1, "S");
      doc.circle(cx + 1.4, cy - 1, 1, "S");
      doc.line(cx - 3, cy + 2, cx + 3, cy + 2);
      break;
    case "flechas":
      doc.line(cx - 2.6, cy - 0.8, cx + 2.6, cy - 0.8);
      doc.line(cx + 2.6, cy - 0.8, cx + 1.4, cy - 1.7);
      doc.line(cx + 2.6, cy + 1, cx - 2.6, cy + 1);
      doc.line(cx - 2.6, cy + 1, cx - 1.4, cy + 1.9);
      break;
    case "estado":
      doc.circle(cx, cy, r, "S");
      break;
    case "usuario":
      doc.circle(cx, cy - 1.5, 1.3, "S");
      doc.line(cx - 2, cy + 2.2, cx + 2, cy + 2.2);
      break;
    default:
      doc.circle(cx, cy, 0.8, "F");
  }
}

/** Dibuja un recibo individual en un PDF nuevo y lo devuelve como ArrayBuffer. */
function reciboPdf(numero: string, pago: PagoRecibo, meta: MetaRecibo): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;

  // ---------- Encabezado ----------
  // Logo (imagen si viene; si no, un distintivo simple)
  let logoOk = false;
  if (meta.logoDataUrl) {
    try {
      // Detectar dimensiones reales del PNG (bytes 16..23 del header)
      const b64 = meta.logoDataUrl.split(",")[1] ?? "";
      const bin = typeof atob === "function" ? atob(b64.slice(0, 40)) : Buffer.from(b64.slice(0, 40), "base64").toString("binary");
      const bytes: number[] = [];
      for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      let w = 0, h = 0;
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
        w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
        h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      }
      const maxW = 48, maxH = 22;
      let drawW = maxW, drawH = maxH;
      if (w > 0 && h > 0) {
        const escala = Math.min(maxW / w, maxH / h);
        drawW = w * escala;
        drawH = h * escala;
      }
      doc.addImage(meta.logoDataUrl, "PNG", M, 12, drawW, drawH, undefined, "FAST");
      logoOk = true;
    } catch {
      /* si falla, se dibuja el distintivo de respaldo */
    }
  }
  if (!logoOk) {
    doc.setFillColor(...ROJO);
    doc.circle(M + 5, 20, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("1", M + 5, 22, { align: "center" });
    doc.setTextColor(...NEGRO);
    doc.setFontSize(15);
    doc.text("La", M + 13, 18);
    doc.setTextColor(...ROJO);
    doc.text("primera", M + 13, 24);
  }

  // Títulos a la derecha
  doc.setTextColor(...NEGRO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("COMPROBANTE DE PAGO", W - M, 20, { align: "right" });
  doc.setTextColor(...ROJO);
  doc.setFontSize(12);
  doc.text("RECIBO DE PAGO", W - M, 28, { align: "right" });

  // Recuadro No.
  const boxW = 78, boxH = 12, boxX = W - M - boxW, boxY = 38;
  doc.setDrawColor(...ROJO);
  doc.setLineWidth(0.5);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "S");
  doc.setTextColor(...ROJO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`No. ${numero}`, boxX + boxW / 2, boxY + 8, { align: "center" });

  // Fecha/hora
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${meta.fecha}  ${meta.hora}`, W - M, boxY + boxH + 7, { align: "right" });

  // ---------- Filas ----------
  const filas: { icono: string; label: string; valor: string; color?: [number, number, number]; negrita?: boolean }[] = [
    { icono: "persona", label: "Beneficiario", valor: pago.beneficiario || "—" },
    { icono: "id", label: "Cédula / RNC", valor: pago.cedula || "—" },
    { icono: "banco", label: "Banco", valor: pago.banco || "—", negrita: true },
    { icono: "tarjeta", label: "Cuenta", valor: `${pago.cuenta || "—"} (${pago.tipoCuenta || "—"})` },
    { icono: "doc", label: "Concepto", valor: pago.concepto || "—" },
    { icono: "grupo", label: "Grupo", valor: meta.grupo || "—" },
    { icono: "flechas", label: "Tipo de pago", valor: meta.tipoPago || "—" },
    { icono: "estado", label: "Estado del pago", valor: meta.estadoPago || "—", color: ESTADO_COLOR[meta.estadoPago] ?? GRIS, negrita: true },
    { icono: "usuario", label: "Procesado por", valor: meta.usuario || "—" },
  ];

  let y = 64;
  const filaH = 13;
  for (const f of filas) {
    icono(doc, f.icono, M + 3, y - 1);
    doc.setTextColor(...NEGRO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(f.label, M + 12, y);

    doc.setFont("helvetica", f.negrita ? "bold" : "normal");
    doc.setTextColor(...(f.color ?? NEGRO));
    const lines = doc.splitTextToSize(String(f.valor), 95);
    doc.text(lines, W - M, y, { align: "right" });

    // separador
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.3);
    doc.line(M, y + filaH - 6, W - M, y + filaH - 6);
    y += filaH;
  }

  // ---------- Recuadro Monto ----------
  y += 4;
  const mH = 22;
  doc.setFillColor(...ROJO_SUAVE);
  doc.roundedRect(M, y, W - 2 * M, mH, 3, 3, "F");
  doc.setFillColor(...ROJO);
  doc.circle(M + 12, y + mH / 2, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("$", M + 12, y + mH / 2 + 1.8, { align: "center" });
  doc.setTextColor(...NEGRO);
  doc.setFontSize(13);
  doc.text("Monto pagado", M + 22, y + mH / 2 + 1.5);
  doc.setTextColor(...ROJO);
  doc.setFontSize(20);
  doc.text(money(pago.monto), W - M - 4, y + mH / 2 + 2.5, { align: "right" });

  // ---------- Pie ----------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text("Documento generado automáticamente por el sistema de Pagos Masivos.", W / 2, H - 14, { align: "center" });

  return doc.output("arraybuffer");
}

/**
 * Construye un ZIP con un recibo PDF por cada pago. Opcionalmente incluye el
 * comprobante del banco en el ZIP.
 */
export async function construirZipRecibos(
  pagos: PagoRecibo[],
  meta: MetaRecibo,
  comprobante?: File | null,
): Promise<{ zip: Blob; cantidad: number }> {
  const zip = new JSZip();
  const carpeta = zip.folder("recibos") ?? zip;

  pagos.forEach((p, i) => {
    const numero = `${meta.baseNumero}-${String(i + 1).padStart(3, "0")}`;
    const buf = reciboPdf(numero, p, meta);
    carpeta.file(`Recibo_${String(i + 1).padStart(3, "0")}_${slug(p.beneficiario)}.pdf`, buf);
  });

  if (comprobante) {
    zip.file(`Comprobante_${comprobante.name}`, comprobante);
  }

  const out = await zip.generateAsync({ type: "blob" });
  return { zip: out, cantidad: pagos.length };
}
