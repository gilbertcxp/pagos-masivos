import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { esAdmin, esContabilidad, esContratos, type Rol } from "@/lib/auth/roles";

type NavItem = { href: string; label: string; icon: string; ver: (r: Rol) => boolean };

const NAV: NavItem[] = [
  { href: "/dashboard",                label: "Dashboard",           icon: "grid",     ver: () => true },
  { href: "/dashboard/solicitudes",    label: "Solicitudes de Pago", icon: "upload",   ver: (r) => esContratos(r) },
  { href: "/dashboard/contabilidad",   label: "Contabilidad",        icon: "check",    ver: (r) => esContabilidad(r) },
  { href: "/dashboard/recibos",        label: "Recibos",             icon: "receipt",  ver: (r) => esContratos(r) || esContabilidad(r) || esAdmin(r) },
  { href: "/dashboard/historial",      label: "Historial",           icon: "clock",    ver: () => true },
  { href: "/dashboard/consorcios",     label: "Cuentas Consorcios",  icon: "bank",     ver: (r) => esAdmin(r) },
  { href: "/dashboard/usuarios",       label: "Usuarios",            icon: "users",    ver: (r) => esAdmin(r) },
  { href: "/dashboard/configuracion",  label: "Configuración",       icon: "settings", ver: (r) => esAdmin(r) },
];

function Icon({ name }: { name: string }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5 shrink-0",
  };
  switch (name) {
    case "grid":
      return (<svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>);
    case "upload":
      return (<svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
    case "check":
      return (<svg {...common}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>);
    case "clock":
      return (<svg {...common}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
    case "receipt":
      return (<svg {...common}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>);
    case "users":
      return (<svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>);
    case "bank":
      return (<svg {...common}><line x1="3" y1="22" x2="21" y2="22" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 2 20 7 4 7" /></svg>);
    case "settings":
      return (<svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>);
    default:
      return <svg {...common} />;
  }
}

function etiquetaRol(rol: Rol | null | undefined): string {
  switch (rol) {
    case "administrador": return "Administrador";
    case "contratos":     return "Contratos";
    case "contabilidad":  return "Contabilidad";
    default:              return "Usuario";
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, correo, rol")
    .eq("id", user.id)
    .single();

  const nombre = profile?.nombre || user.email?.split("@")[0] || "Usuario";
  const rol = (profile?.rol ?? "usuario") as Rol;
  const items = NAV.filter((n) => n.ver(rol));

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Barra lateral */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 text-slate-300">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Pagos Masivos</p>
            <p className="text-[11px] text-slate-400">Banreservas</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-800 hover:text-white"
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{nombre}</p>
            <p className="text-xs text-slate-400">{etiquetaRol(rol)}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:bg-red-600 hover:text-white"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between bg-white px-6 py-4 border-b border-slate-200 md:hidden">
          <span className="font-semibold text-slate-800">Pagos Masivos</span>
          <form action={logout}>
            <button className="text-sm text-red-600">Salir</button>
          </form>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
