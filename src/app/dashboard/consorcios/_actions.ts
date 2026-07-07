"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const normNombre = (s: string) =>
  String(s ?? "")
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) =>
      (({ á:"a",é:"e",í:"i",ó:"o",ú:"u",ü:"u",ñ:"n",Á:"A",É:"E",Í:"I",Ó:"O",Ú:"U",Ü:"U",Ñ:"N" } as Record<string,string>)[c] ?? c))
    .trim()
    .toUpperCase();

function validar(nombre: string, cuenta: string) {
  if (!nombre.trim()) throw new Error("El nombre del consorcio es obligatorio.");
  if (!/^[0-9]{1,10}$/.test(cuenta.trim()))
    throw new Error("La cuenta debe ser numérica (máx. 10 dígitos).");
}

export async function crearConsorcio(
  nombre: string,
  numeroCuenta: string,
  tipoCuenta: "CA" | "CC",
) {
  validar(nombre, numeroCuenta);
  const supabase = await createClient();
  const { error } = await supabase.from("grupos").insert({
    nombre: nombre.trim(),
    nombre_norm: normNombre(nombre),
    numero_cuenta_origen: numeroCuenta.trim(),
    tipo_cuenta_origen: tipoCuenta,
    moneda: "DOP",
  });
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un consorcio con ese nombre.");
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/consorcios");
}

export async function editarConsorcio(
  id: string,
  nombre: string,
  numeroCuenta: string,
  tipoCuenta: "CA" | "CC",
) {
  validar(nombre, numeroCuenta);
  const supabase = await createClient();
  const { error } = await supabase.from("grupos").update({
    nombre: nombre.trim(),
    nombre_norm: normNombre(nombre),
    numero_cuenta_origen: numeroCuenta.trim(),
    tipo_cuenta_origen: tipoCuenta,
  }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un consorcio con ese nombre.");
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/consorcios");
}

export async function eliminarConsorcio(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("grupos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/consorcios");
}
