import { redirect } from "next/navigation";

export default function Home() {
  // El middleware decidirá: si hay sesión va al dashboard, si no al login.
  redirect("/dashboard");
}
