"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function actualizarRol(userId: string, rol: string) {
  const supabase = await createClient();
  const rolesValidos = ["administrador", "contratos", "contabilidad", "usuario"];
  if (!rolesValidos.includes(rol)) throw new Error("Rol inválido.");
  const { error } = await supabase.from("profiles").update({ rol }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/usuarios");
}

export async function actualizarNombrePersonal(userId: string, nombrePersonal: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombre_personal: nombrePersonal.trim() })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/usuarios");
}
