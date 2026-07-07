import { createClient } from "@/lib/supabase/server";
import TablaConsorcios from "./TablaConsorcios";

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grupos")
    .select("id, nombre, numero_cuenta_origen, tipo_cuenta_origen")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Cuentas Consorcios</h1>
        <p className="text-slate-500">
          Administra los consorcios y sus cuentas bancarias de origen para la generación del TXT MT.
        </p>
      </div>

      <TablaConsorcios datos={data ?? []} />
    </div>
  );
}
