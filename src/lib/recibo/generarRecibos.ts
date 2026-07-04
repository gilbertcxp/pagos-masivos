/**
 * Genera un recibo de pago en PDF por CADA transacción y los empaqueta en
 * un archivo ZIP. Se usa en el navegador (jsPDF + JSZip).
 */
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const money = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const slug = (s: string) =>
  (s || "beneficiario").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 40);

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
};

/** Dibuja un recibo individual en un PDF nuevo y lo devuelve como ArrayBuffer. */
function reciboPdf(numero: string, pago: PagoRecibo, meta: MetaRecibo): ArrayBuffer {
  const doc = new jsPDF({ format: "a5", unit: "mm" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  // Encabezado
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(meta.empresa || "UD GROUP DOMINICANA", M, 11);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("Recibo de Pago", M, 20);

  // Nº y fecha
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No. ${numero}`, M, 36);
  doc.text(`${meta.fecha}  ${meta.hora}`, W - M, 36, { align: "right" });

  // Filas
  const filas: [string, string][] = [
    ["Beneficiario", pago.beneficiario || "—"],
    ["Cédula / RNC", pago.cedula || "—"],
    ["Banco", pago.banco || "—"],
    ["Cuenta", `${pago.cuenta || "—"} (${pago.tipoCuenta || "—"})`],
    ["Concepto", pago.concepto || "—"],
    ["Grupo", meta.grupo || "—"],
    ["Tipo de pago", meta.tipoPago || "—"],
    ["Estado del pago", meta.estadoPago || "—"],
    ["Comprobante", meta.comprobante || "—"],
    ["Procesado por", meta.usuario || "—"],
  ];

  let y = 46;
  doc.setFontSize(9);
  for (const [k, v] of filas) {
    doc.setTextColor(100, 116, 139);
    doc.text(k, M, y);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(String(v), W - M - 45);
    doc.text(lines, W - M, y, { align: "right" });
    y += 6 * Math.max(1, lines.length);
  }

  // Monto destacado
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 9;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("Monto pagado", M, y);
  doc.setTextColor(37, 99, 235);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(money(pago.monto), W - M, y, { align: "right" });

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Documento generado automáticamente por el sistema de Pagos Masivos.", W / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

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
    const blob = reciboPdf(numero, p, meta);
    carpeta.file(`Recibo_${String(i + 1).padStart(3, "0")}_${slug(p.beneficiario)}.pdf`, blob);
  });

  if (comprobante) {
    zip.file(`Comprobante_${comprobante.name}`, comprobante);
  }

  const out = await zip.generateAsync({ type: "blob" });
  return { zip: out, cantidad: pagos.length };
}
