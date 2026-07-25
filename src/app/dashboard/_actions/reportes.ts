"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; mensaje: string };

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

  const { error } = await supabase.from("reportes").insert({
    user_id: user.id,
    tipo,
    mensaje: texto,
    pagina: pagina || null,
  });
  if (error) return { ok: false, mensaje: error.message };

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
