"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; mensaje: string };

async function notificarPorCorreo(
  tipo: "problema" | "mejora",
  mensaje: string,
  pagina: string,
  autor: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const destino = process.env.REPORTES_EMAIL_DESTINO;
  if (!apiKey || !destino) return;

  const etiqueta = tipo === "problema" ? "Problema" : "Mejora";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Pagos Masivos <onboarding@resend.dev>",
      to: [destino],
      subject: `[${etiqueta}] Nuevo reporte en Pagos Masivos`,
      html: `
        <p><strong>Tipo:</strong> ${etiqueta}</p>
        <p><strong>Reportado por:</strong> ${autor}</p>
        <p><strong>Página:</strong> ${pagina || "—"}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${mensaje.replace(/\n/g, "<br/>")}</p>
      `,
    }),
  });
}

export async function crearReporte(
  tipo: "problema" | "mejora",
  mensaje: string,
  pagina: string,
): Promise<Resultado> {
  const texto = mensaje.trim();
  if (texto.length < 5) return { ok: false, mensaje: "Describe con al menos 5 caracteres." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: "Sesión expirada." };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, correo")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("reportes").insert({
    user_id: user.id,
    tipo,
    mensaje: texto,
    pagina: pagina || null,
  });
  if (error) return { ok: false, mensaje: error.message };

  try {
    await notificarPorCorreo(tipo, texto, pagina, perfil?.nombre || perfil?.correo || "Usuario");
  } catch (_) { /* no bloquear si falla el envio de correo */ }

  revalidatePath("/dashboard/reportes");
  return { ok: true };
}

export async function marcarResueltoReporte(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: "Sesión expirada." };

  const { error } = await supabase
    .from("reportes")
    .update({ estado: "resuelto", resuelto_at: new Date().toISOString(), resuelto_por: user.id })
    .eq("id", id);
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/dashboard/reportes");
  return { ok: true };
}

export async function reabrirReporte(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reportes")
    .update({ estado: "pendiente", resuelto_at: null, resuelto_por: null })
    .eq("id", id);
  if (error) return { ok: false, mensaje: error.message };

  revalidatePath("/dashboard/reportes");
  return { ok: true };
}
