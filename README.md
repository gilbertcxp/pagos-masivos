# Pagos Masivos · Banreservas

Aplicación web para automatizar **pagos masivos a proveedores**: importar un
Excel de solicitud, generar el archivo **TXT** compatible con el banco, guardar
el historial y generar recibos de pago.

## Tecnologías

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS**
- **Supabase** (base de datos PostgreSQL, autenticación y almacenamiento)

## Requisitos

- Node.js 20+ y npm
- Un proyecto en [Supabase](https://supabase.com)

## Puesta en marcha (local)

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar la plantilla de variables y rellenarla con tus claves de Supabase
   (Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
   ```

3. Ejecutar la base de datos: en Supabase → SQL Editor, correr el contenido de
   [`supabase/schema.sql`](supabase/schema.sql).

4. Levantar el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Abrir http://localhost:3000

## Despliegue en Vercel

1. Subir este repositorio a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importar el repo.
3. En **Environment Variables**, agregar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. Cada push a la rama principal se publicará automáticamente.

## Módulos

- **Dashboard** — indicadores y últimos pagos
- **Solicitudes de Pago** — cargar y validar el Excel
- **Generar TXT** — tipo de pago (Interbancaria / Terceros) y archivo del banco
- **Historial** — búsqueda y descarga de procesos
- **Recibos** — comprobante del banco y recibo generado
- **Usuarios** — administración y roles
- **Configuración**

## Seguridad

Las claves `service_role` y la contraseña de la base de datos **nunca** se
suben al repositorio. El archivo `.env.local` está en `.gitignore`.
