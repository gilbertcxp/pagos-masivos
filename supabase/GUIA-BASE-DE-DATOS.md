# Guía: Base de datos y Autenticación (Supabase)

App de **Pagos Masivos** — Banco Banreservas.

Esta es la Fase 0 (base de datos + login). Sigue los pasos en orden.

---

## Paso 1 — Ejecutar el esquema de la base de datos

1. Entra a tu proyecto en [supabase.com](https://supabase.com).
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abre el archivo `schema.sql` (está en esta misma carpeta), copia **todo** su contenido y pégalo.
4. Pulsa **Run** (o `Ctrl + Enter`).
5. Deberías ver *"Success. No rows returned"*. ✅

Esto crea:

| Tabla | Para qué sirve |
|-------|----------------|
| `profiles` | Usuarios (nombre, correo, rol) |
| `payment_batches` | Cada proceso: Excel → TXT → recibo |
| `payments` | Cada fila del Excel (un pago) |
| `receipts` | Comprobante del banco + recibo generado |

Y también: los **roles** (administrador/usuario), la **seguridad por filas** (cada usuario solo ve lo suyo, el admin ve todo) y los **buckets** de archivos.

---

## Paso 2 — Configurar la autenticación

1. Menú izquierdo → **Authentication** → **Providers**.
2. Asegúrate de que **Email** esté activado (viene activado por defecto).
3. (Recomendado para empezar) → **Authentication → Providers → Email** → desactiva
   *"Confirm email"* mientras desarrollas, así puedes entrar sin confirmar el correo.
   Vuelve a activarlo antes de salir a producción.

---

## Paso 3 — Crear el primer usuario y hacerlo Administrador

1. Menú izquierdo → **Authentication → Users → Add user → Create new user**.
2. Escribe tu correo y una contraseña. Créalo.
3. Gracias al trigger automático, ya se creó su fila en `profiles` con rol `usuario`.
4. Para convertirlo en **administrador**, ve a **SQL Editor** y ejecuta
   (cambia el correo por el tuyo):

   ```sql
   update public.profiles
   set rol = 'administrador'
   where correo = 'tu-correo@ejemplo.com';
   ```

5. Verifica con:

   ```sql
   select correo, rol from public.profiles;
   ```

---

## Paso 4 — Verificar los buckets de Storage

1. Menú izquierdo → **Storage**.
2. Confirma que existen 4 buckets **privados**:
   `excel-solicitudes`, `txt-generados`, `comprobantes`, `recibos`.
3. Si no aparecieron (por permisos del SQL), créalos a mano con **New bucket**
   y déjalos como **Private**.

---

## ✅ Listo

Con esto la base de datos y la autenticación quedan funcionando. El siguiente
paso (Fase 1) será montar el proyecto Next.js y conectarlo a esta base usando
tu **Project URL** y tu **anon key**.

> 🔒 Recuerda: la `anon key` y la URL son públicas y van en el proyecto.
> La contraseña de la base de datos y la `service_role` key son secretas —
> nunca las subas a GitHub.
