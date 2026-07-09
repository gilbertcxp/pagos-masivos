"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Perfil = { nombre: string | null; correo: string | null; rol: string | null } | null;

async function contexto() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada.");
  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, correo, rol")
    .eq("id", user.id)
    .single();
  return { supabase, user, perfil: perfil as Perfil };
}

async function auditar(
  supabase: SupabaseClient,
  userId: string,
  perfil: Perfil,
  batchId: string,
  accion: string,
  descripcion: string,
  meta: Record<string, unknown> = {},
) {
  await supabase.from("audit_log").insert({
    batch_id: batchId,
    user_id: userId,
    user_nombre: perfil?.nombre || perfil?.correo || null,
    user_rol: perfil?.rol ?? null,
    accion,
    descripcion,
    meta,
  });
}

async function notificar(
  supabase: SupabaseClient,
  batchId: string,
  rol: "contratos" | "contabilidad",
  tipo: string,
  mensaje: string,
) {
  await supabase.from("notifications").insert({
    batch_id: batchId,
    rol,
    tipo,
    mensaje,
  });
}

/** Publica una solicitud (Contratos → Contabilidad). */
export async function publicarSolicitud(batchId: string) {
  const { supabase, user, perfil } = await contexto();

  const { data: b, error: eSel } = await supabase
    .from("payment_batches")
    .select("id, estado, grupo, numero_solicitud, total_registros, monto_total")
    .eq("id", batchId)
    .single();
  if (eSel || !b) throw new Error("Solicitud no encontrada.");
  if (!(b.estado === "borrador" || b.estado === "devuelta")) {
    throw new Error(`No se puede publicar en estado "${b.estado}".`);
  }

  const { error } = await supabase
    .from("payment_batches")
    .update({
      estado: "publicada",
      published_by: user.id,
      published_at: new Date().toISOString(),
      motivo_devolucion: null,
    })
    .eq("id", batchId);
  if (error) throw new Error(error.message);

  await auditar(
    supabase, user.id, perfil,
    batchId,
    "publicar",
    `Solicitud ${b.numero_solicitud ?? ""} publicada por ${perfil?.nombre ?? "usuario"}`,
    { grupo: b.grupo, registros: b.total_registros, monto: b.monto_total },
  );

  // Notificación no bloqueante — si falla no rompe el flujo
  try {
    await notificar(
      supabase,
      batchId,
      "contabilidad",
      "solicitud_publicada",
      `Nueva solicitud ${b.numero_solicitud ?? ""} publicada (${b.grupo ?? "sin grupo"}) — ${b.total_registros} pagos`,
    );
  } catch (_) { /* ignorar fallos de notificación */ }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath("/dashboard/contabilidad");
}

/** Contabilidad marca una solicitud como "en revisión". */
export async function iniciarRevision(batchId: string) {
  const { supabase, user } = await contexto();
  const { data: b } = await supabase
    .from("payment_batches")
    .select("estado, numero_solicitud")
    .eq("id", batchId)
    .single();
  if (!b) throw new Error("Solicitud no encontrada.");
  if (b.estado !== "publicada") return;

  await supabase
    .from("payment_batches")
    .update({
      estado: "en_revision",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  const { data: perfil } = await supabase.from("profiles").select("nombre, correo, rol").eq("id", user.id).single();
  await auditar(supabase, user.id, perfil as Perfil, batchId, "revisar", `Solicitud ${b.numero_solicitud ?? ""} en revisión`);
  revalidatePath("/dashboard/contabilidad");
}

/** Contabilidad devuelve la solicitud a Contratos con un motivo. */
export async function devolverSolicitud(batchId: string, motivo: string) {
  const { supabase, user, perfil } = await contexto();
  const motivoLimpio = String(motivo || "").trim();
  if (motivoLimpio.length < 5) throw new Error("Indica un motivo (mín. 5 caracteres).");

  const { data: b } = await supabase
    .from("payment_batches")
    .select("estado, numero_solicitud, user_id")
    .eq("id", batchId)
    .single();
  if (!b) throw new Error("Solicitud no encontrada.");
  if (!(b.estado === "publicada" || b.estado === "en_revision")) {
    throw new Error(`No se puede devolver en estado "${b.estado}".`);
  }

  await supabase
    .from("payment_batches")
    .update({ estado: "devuelta", motivo_devolucion: motivoLimpio })
    .eq("id", batchId);

  await auditar(
    supabase, user.id, perfil,
    batchId,
    "devolver",
    `Solicitud ${b.numero_solicitud ?? ""} devuelta por ${perfil?.nombre ?? "usuario"}`,
    { motivo: motivoLimpio },
  );

  try {
    await supabase.from("notifications").insert({
      batch_id: batchId,
      user_id: b.user_id,
      tipo: "solicitud_devuelta",
      mensaje: `Tu solicitud ${b.numero_solicitud ?? ""} fue devuelta: ${motivoLimpio}`,
    });
  } catch (_) { /* ignorar */ }

  revalidatePath("/dashboard/contabilidad");
  revalidatePath("/dashboard/solicitudes");
}

/** Contabilidad marca la solicitud como pagada. */
export async function marcarPagada(batchId: string) {
  const { supabase, user, perfil } = await contexto();
  const { data: b } = await supabase
    .from("payment_batches")
    .select("estado, numero_solicitud")
    .eq("id", batchId)
    .single();
  if (!b) throw new Error("Solicitud no encontrada.");
  if (b.estado !== "txt_generado") {
    throw new Error("Solo se puede marcar como pagada una solicitud con TXT generado.");
  }
  await supabase.from("payment_batches").update({ estado: "pagada" }).eq("id", batchId);
  await auditar(
    supabase, user.id, perfil,
    batchId,
    "pagar",
    `Solicitud ${b.numero_solicitud ?? ""} marcada como pagada por ${perfil?.nombre ?? "usuario"}`,
  );
  revalidatePath("/dashboard/contabilidad");
  revalidatePath("/dashboard/historial");
}

/** Cancela una solicitud (admin o dueño en borrador). */
export async function cancelarSolicitud(batchId: string) {
  const { supabase, user, perfil } = await contexto();
  await supabase.from("payment_batches").update({ estado: "cancelada" }).eq("id", batchId);
  await auditar(supabase, user.id, perfil, batchId, "cancelar", `Solicitud cancelada por ${perfil?.nombre ?? "usuario"}`);
  revalidatePath("/dashboard/solicitudes");
  revalidatePath("/dashboard/contabilidad");
  revalidatePath("/dashboard/historial");
}

/** Contratos responde al motivo de devolución de Contabilidad. */
export async function responderDevolucion(batchId: string, respuesta: string) {
  const { supabase, user, perfil } = await contexto();
  await supabase
    .from("payment_batches")
    .update({ respuesta_devolucion: respuesta })
    .eq("id", batchId);
  await auditar(supabase, user.id, perfil, batchId, "responder_devolucion", `Respuesta a devolución: ${respuesta}`);
  revalidatePath("/dashboard/solicitudes");
  revalidatePath("/dashboard/contabilidad");
}

/** Versión para form action (acepta FormData con campo "respuesta"). */
export async function responderDevolucionForm(batchId: string, formData: FormData) {
  const respuesta = String(formData.get("respuesta") ?? "").trim();
  if (!respuesta) return;
  await responderDevolucion(batchId, respuesta);
}

/** Auditar la generación del TXT (llamada desde el cliente tras generar). */
export async function registrarTxtGenerado(batchId: string, nombreArchivo: string, tipo: string) {
  const { supabase, user, perfil } = await contexto();
  await supabase
    .from("payment_batches")
    .update({ estado: "txt_generado" })
    .eq("id", batchId);
  await auditar(
    supabase, user.id, perfil,
    batchId,
    "generar_txt",
    `TXT ${tipo} generado por ${perfil?.nombre ?? "usuario"}`,
    { archivo: nombreArchivo },
  );
  revalidatePath("/dashboard/contabilidad");
  revalidatePath("/dashboard/historial");
}
