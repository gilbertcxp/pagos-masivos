import { createClient } from "@/lib/supabase/server";
import FilaUsuario from "./FilaUsuario";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: usuarios } = await supabase
    .from("profiles")
    .select("id, nombre, correo, rol")
    .order("correo", { ascending: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
        <p className="text-slate-500">Asigna roles: administrador, contratos, contabilidad, usuario.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Usuario</th>
              <th className="px-4 py-3 text-left font-medium">Rol</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(usuarios ?? []).map((u) => (
              <FilaUsuario
                key={u.id}
                id={u.id}
                nombre={u.nombre ?? ""}
                correo={u.correo ?? ""}
                rol={u.rol ?? "usuario"}
                esYo={u.id === user?.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Nota: para crear nuevos usuarios, agrégalos desde <b>Supabase → Authentication → Users</b>. Aquí puedes asignarles su rol.
      </p>
    </div>
  );
}
