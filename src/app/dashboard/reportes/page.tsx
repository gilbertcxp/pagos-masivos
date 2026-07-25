import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esAdmin, type Rol } from "@/lib/auth/roles";
import { fmtFechaHora } from "@/lib/fecha";
import ListaReportes from "./ListaReportes";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user?.id ?? "")
    .single();
  const rol = (perfil?.rol ?? "usuario") as Rol;

  if (!esAdmin(rol)) redirect("/dashboard");

  const { data } = await supabase
    .from("reportes")
    .select("id, tipo, mensaje, pagina, estado, created_at, resuelto_at, profiles:profiles!reportes_user_id_fkey(nombre, correo, rol)")
    .order("created_at", { ascending: false });

  const reportes = (data ?? []).map((r) => {
    const perfilAutor = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      tipo: r.tipo as "problema" | "mejora",
      mensaje: r.mensaje,
      pagina: r.pagina,
      estado: r.estado as "pendiente" | "resuelto",
      creado: fmtFechaHora(r.created_at),
      autor: (perfilAutor as { nombre?: string; correo?: string } | null)?.nombre
        || (perfilAutor as { nombre?: string; correo?: string } | null)?.correo
        || "—",
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reportes</h1>
        <p className="text-slate-500">Problemas y mejoras reportadas por los usuarios.</p>
      </div>

      <ListaReportes reportes={reportes} />
    </div>
  );
}
