/**
 * Genera un recibo de pago en PDF por CADA transacción y los empaqueta en ZIP.
 * Diseño: "La Primera" — azul marino, íconos en círculos grises, monto destacado.
 * Número de recibo: YYYY-MM-DD-NNN (fecha del comprobante + secuencial por lote).
 */
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const slugify = (s: string) =>
  (s || "beneficiario").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

// ── Paleta ──────────────────────────────────────────────────────────────────
const NAVY:  [number, number, number] = [13,  27,  62];   // texto principal
const GRIS_ICO: [number, number, number] = [241, 245, 249]; // fondo círculo icono
const GRIS_SEP: [number, number, number] = [226, 232, 240]; // separador horizontal
const GRIS_MONTO: [number, number, number] = [248, 250, 252]; // fondo recuadro monto
const GRIS_TXT: [number, number, number] = [100, 116, 139]; // texto secundario

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
  fechaComprobante: string;  // "DD/MM/YYYY" — viene del comprobante del banco
  estadoPago: string;
  usuario: string;
  baseNumero: string;        // "YYYY-MM-DD" — se usa como prefijo del recibo
  logoDataUrl?: string;
};

// ── Íconos (dibujados en jsPDF dentro de un círculo gris) ───────────────────
function dibujarIcono(doc: jsPDF, nombre: string, cx: number, cy: number) {
  doc.setDrawColor(...NAVY);
  doc.setFillColor(...NAVY);
  doc.setLineWidth(0.35);
  const s = 0.9; // escala

  switch (nombre) {
    case "fecha": {
      // cuerpo calendario
      doc.roundedRect(cx - 3*s, cy - 2.8*s, 6*s, 5.4*s, 0.5*s, 0.5*s, "S");
      // topes superiores
      doc.line(cx - 1.5*s, cy - 3.8*s, cx - 1.5*s, cy - 2*s);
      doc.line(cx + 1.5*s, cy - 3.8*s, cx + 1.5*s, cy - 2*s);
      // línea superior interna
      doc.line(cx - 3*s, cy - 1*s, cx + 3*s, cy - 1*s);
      // puntos días
      doc.setFillColor(...NAVY);
      doc.circle(cx - 1.3*s, cy + 0.6*s, 0.45*s, "F");
      doc.circle(cx + 0.2*s, cy + 0.6*s, 0.45*s, "F");
      doc.circle(cx + 1.7*s, cy + 0.6*s, 0.45*s, "F");
      break;
    }
    case "persona": {
      doc.circle(cx, cy - 1.8*s, 1.4*s, "S");
      doc.line(cx - 2.8*s, cy + 2.6*s, cx - 1.6*s, cy + 0.4*s);
      doc.line(cx + 2.8*s, cy + 2.6*s, cx + 1.6*s, cy + 0.4*s);
      doc.line(cx - 2.8*s, cy + 2.6*s, cx + 2.8*s, cy + 2.6*s);
      doc.line(cx - 1.6*s, cy + 0.4*s, cx + 1.6*s, cy + 0.4*s);
      break;
    }
    case "id": {
      doc.roundedRect(cx - 3*s, cy - 2.2*s, 6*s, 4.4*s, 0.5*s, 0.5*s, "S");
      doc.circle(cx - 1.4*s, cy - 0.2*s, 0.85*s, "S");
      doc.line(cx + 0.2*s, cy - 1*s, cx + 2.4*s, cy - 1*s);
      doc.line(cx + 0.2*s, cy + 0.2*s, cx + 2.4*s, cy + 0.2*s);
      doc.line(cx + 0.2*s, cy + 1.2*s, cx + 1.6*s, cy + 1.2*s);
      break;
    }
    case "banco": {
      // tejado
      doc.line(cx - 3.2*s, cy - 0.8*s, cx, cy - 3.2*s);
      doc.line(cx, cy - 3.2*s, cx + 3.2*s, cy - 0.8*s);
      doc.line(cx - 3.2*s, cy - 0.8*s, cx + 3.2*s, cy - 0.8*s);
      // columnas
      doc.line(cx - 1.8*s, cy - 0.8*s, cx - 1.8*s, cy + 1.6*s);
      doc.line(cx,          cy - 0.8*s, cx,          cy + 1.6*s);
      doc.line(cx + 1.8*s, cy - 0.8*s, cx + 1.8*s, cy + 1.6*s);
      // base
      doc.line(cx - 3.2*s, cy + 1.8*s, cx + 3.2*s, cy + 1.8*s);
      doc.line(cx - 3.2*s, cy + 2.6*s, cx + 3.2*s, cy + 2.6*s);
      break;
    }
    case "tarjeta": {
      doc.roundedRect(cx - 3.2*s, cy - 2.2*s, 6.4*s, 4.4*s, 0.6*s, 0.6*s, "S");
      doc.line(cx - 3.2*s, cy - 0.4*s, cx + 3.2*s, cy - 0.4*s);
      doc.setFillColor(...NAVY);
      doc.roundedRect(cx - 2.4*s, cy + 0.6*s, 2*s, 1.2*s, 0.2*s, 0.2*s, "F");
      break;
    }
    case "doc": {
      doc.line(cx - 2.2*s, cy - 3*s, cx + 1.2*s, cy - 3*s);
      doc.line(cx + 1.2*s, cy - 3*s, cx + 2.4*s, cy - 1.8*s);
      doc.line(cx + 2.4*s, cy - 1.8*s, cx + 2.4*s, cy + 3*s);
      doc.line(cx + 2.4*s, cy + 3*s, cx - 2.2*s, cy + 3*s);
      doc.line(cx - 2.2*s, cy + 3*s, cx - 2.2*s, cy - 3*s);
      // pliegue esquina
      doc.line(cx + 1.2*s, cy - 3*s, cx + 1.2*s, cy - 1.8*s);
      doc.line(cx + 1.2*s, cy - 1.8*s, cx + 2.4*s, cy - 1.8*s);
      // líneas texto
      doc.line(cx - 1.4*s, cy - 0.8*s, cx + 1.6*s, cy - 0.8*s);
      doc.line(cx - 1.4*s, cy + 0.6*s, cx + 1.6*s, cy + 0.6*s);
      doc.line(cx - 1.4*s, cy + 2*s,   cx + 0.8*s, cy + 2*s);
      break;
    }
    case "grupo": {
      // dos personas
      doc.circle(cx - 1.6*s, cy - 2*s, 1.1*s, "S");
      doc.circle(cx + 1.6*s, cy - 2*s, 1.1*s, "S");
      doc.line(cx - 4*s,    cy + 2.6*s, cx - 2.6*s, cy + 0.4*s);
      doc.line(cx - 2.6*s, cy + 0.4*s, cx + 0.2*s, cy + 0.4*s);
      doc.line(cx + 4*s,   cy + 2.6*s, cx + 2.6*s, cy + 0.4*s);
      doc.line(cx + 2.6*s, cy + 0.4*s, cx - 0.2*s, cy + 0.4*s);
      doc.line(cx - 4*s,   cy + 2.6*s, cx + 4*s,   cy + 2.6*s);
      break;
    }
    case "escudo": {
      // escudo simplificado
      doc.line(cx - 2.6*s, cy - 2.4*s, cx + 2.6*s, cy - 2.4*s);
      doc.line(cx - 2.6*s, cy - 2.4*s, cx - 2.6*s, cy + 0.6*s);
      doc.line(cx + 2.6*s, cy - 2.4*s, cx + 2.6*s, cy + 0.6*s);
      doc.line(cx - 2.6*s, cy + 0.6*s, cx, cy + 3*s);
      doc.line(cx + 2.6*s, cy + 0.6*s, cx, cy + 3*s);
      // tick interno
      doc.line(cx - 1.2*s, cy - 0.2*s, cx - 0.2*s, cy + 1*s);
      doc.line(cx - 0.2*s, cy + 1*s,   cx + 1.6*s, cy - 1.2*s);
      break;
    }
    default:
      doc.circle(cx, cy, 0.8*s, "F");
  }
}

// ── Dibuja un círculo gris con ícono centrado ────────────────────────────────
function circuloIcono(doc: jsPDF, nombre: string, cx: number, cy: number, r = 5.5) {
  doc.setFillColor(...GRIS_ICO);
  doc.circle(cx, cy, r, "F");
  dibujarIcono(doc, nombre, cx, cy);
}

// ── Genera un recibo individual ──────────────────────────────────────────────
function reciboPdf(numero: string, pago: PagoRecibo, meta: MetaRecibo): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const W = doc.internal.pageSize.getWidth();  // 210
  const M = 16;  // margen

  // ── LOGO ──────────────────────────────────────────────────────────────
  let logoOk = false;
  if (meta.logoDataUrl) {
    try {
      const b64 = meta.logoDataUrl.split(",")[1] ?? "";
      const bin = typeof atob === "function"
        ? atob(b64.slice(0, 40))
        : Buffer.from(b64.slice(0, 40), "base64").toString("binary");
      const bytes: number[] = [];
      for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      let pw = 0, ph = 0;
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
        pw = (bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19];
        ph = (bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23];
      }
      const maxW = 58, maxH = 32;
      let dw = maxW, dh = maxH;
      if (pw > 0 && ph > 0) {
        const esc = Math.min(maxW / pw, maxH / ph);
        dw = pw * esc; dh = ph * esc;
      }
      doc.addImage(meta.logoDataUrl, "PNG", M, 14, dw, dh, undefined, "FAST");
      logoOk = true;
    } catch { /* logo fallback abajo */ }
  }
  if (!logoOk) {
    doc.setFillColor(227, 20, 35);
    doc.circle(M + 10, 28, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("1", M + 10, 30, { align: "center" });
    doc.setTextColor(...NAVY);
    doc.setFontSize(13);
    doc.text("La primera", M + 22, 30);
  }

  // Línea divisoria vertical entre logo y título
  doc.setDrawColor(...GRIS_SEP);
  doc.setLineWidth(0.5);
  doc.line(M + 72, 14, M + 72, 46);

  // Título derecha
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("COMPROBANTE DE PAGO", W - M, 32, { align: "right" });

  // Doble línea separadora
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.line(M, 52, W - M, 52);
  doc.setLineWidth(0.3);
  doc.line(M, 54.5, W - M, 54.5);

  // ── RECUADRO NÚMERO DE RECIBO ─────────────────────────────────────────
  const boxY = 60, boxH = 22;
  doc.setDrawColor(...GRIS_SEP);
  doc.setLineWidth(0.5);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, boxY, W - 2 * M, boxH, 3, 3, "FD");
  // Ícono doc en círculo
  circuloIcono(doc, "doc", M + 13, boxY + boxH / 2, 5);
  // Texto
  doc.setTextColor(...GRIS_TXT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("RECIBO No.", M + 22, boxY + boxH / 2 - 2);
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(numero, M + 22, boxY + boxH / 2 + 7);

  // ── FILAS DE DATOS ───────────────────────────────────────────────────
  const filas: { ico: string; label: string; valor: string }[] = [
    { ico: "fecha",   label: "Fecha del comprobante", valor: meta.fechaComprobante || "—" },
    { ico: "persona", label: "Beneficiario",           valor: (pago.beneficiario || "—").toUpperCase() },
    { ico: "id",      label: "Cédula / RNC",           valor: pago.cedula || "—" },
    { ico: "banco",   label: "Banco",                  valor: (pago.banco || "—").toUpperCase() },
    { ico: "tarjeta", label: "Cuenta",                 valor: `${pago.cuenta || "—"} (${(pago.tipoCuenta || "—").toUpperCase()})` },
    { ico: "doc",     label: "Concepto",               valor: pago.concepto || "—" },
    { ico: "grupo",   label: "Grupo",                  valor: (meta.grupo || "—").toUpperCase() },
  ];

  let y = 92;
  const rowH = 16;

  for (const f of filas) {
    // círculo + ícono
    circuloIcono(doc, f.ico, M + 7, y + rowH / 2 - 1, 5.5);

    // label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(f.label, M + 17, y + rowH / 2 + 1);

    // valor (right-aligned, puede truncarse si es muy largo)
    doc.setFont("helvetica", "normal");
    const maxValorW = W - M - (M + 17) - 35;  // space left for value
    const valorLines = doc.splitTextToSize(String(f.valor), maxValorW + 35);
    doc.text(valorLines[0], W - M, y + rowH / 2 + 1, { align: "right" });

    // separador
    doc.setDrawColor(...GRIS_SEP);
    doc.setLineWidth(0.25);
    doc.line(M, y + rowH, W - M, y + rowH);

    y += rowH;
  }

  // ── RECUADRO MONTO ────────────────────────────────────────────────────
  y += 8;
  const mH = 46;
  doc.setFillColor(...GRIS_MONTO);
  doc.setDrawColor(...GRIS_SEP);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W - 2 * M, mH, 4, 4, "FD");

  // "— MONTO PAGADO —" centrado con guiones
  const labelY = y + 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TXT);
  const labelTxt = "MONTO PAGADO";
  const txtW = doc.getTextWidth(labelTxt);
  const lineLen = (W - 2 * M - txtW - 14) / 2;
  const lineXL = M + 8;
  const lineXR = W - M - 8;
  const lineY = labelY - 1.5;
  doc.setDrawColor(...GRIS_TXT);
  doc.setLineWidth(0.3);
  doc.line(lineXL, lineY, lineXL + lineLen, lineY);
  doc.line(lineXR - lineLen, lineY, lineXR, lineY);
  doc.text(labelTxt, W / 2, labelY, { align: "center" });

  // Monto grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...NAVY);
  doc.text(money(pago.monto), W / 2, y + mH - 10, { align: "center" });

  // ── PIE ───────────────────────────────────────────────────────────────
  const footerY = y + mH + 14;
  circuloIcono(doc, "escudo", M + 7, footerY, 5);
  doc.setDrawColor(...GRIS_SEP);
  doc.setLineWidth(0.5);
  doc.line(M + 16, footerY - 6, M + 16, footerY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TXT);
  doc.text("Documento generado automáticamente por el", M + 20, footerY - 2);
  doc.text("Sistema de Pagos Masivos.", M + 20, footerY + 4);

  return doc.output("arraybuffer");
}

// ── Construye el ZIP con un PDF por pago ────────────────────────────────────
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
    carpeta.file(`Recibo_${String(i + 1).padStart(3, "0")}_${slugify(p.beneficiario)}.pdf`, buf);
  });

  if (comprobante) {
    zip.file(`Comprobante_${comprobante.name}`, comprobante);
  }

  const out = await zip.generateAsync({ type: "blob" });
  return { zip: out, cantidad: pagos.length };
}
