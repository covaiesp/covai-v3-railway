# COVAI V3 — Project Context

## Producto

COVAI es un sistema de reservas automatizado vía WhatsApp para restaurantes.
Dashboard operativo para que el dueño vea reservas, conversaciones y estado del sistema.

**URL producción:** covai.es (deployado en Railway)
**Supabase project:** ptmfgyflyjkqjkzwrlnx

---

## Stack

- **Frontend:** Next.js (pages router), React, inline styles
- **DB:** Supabase (Postgres)
- **WhatsApp bot:** Supabase Edge Function `covai-processor` (Deno)
- **Automatización:** Make.com → webhook → Edge Function
- **SMS/WhatsApp:** Twilio
- **Deploy:** Railway (git push → auto-deploy)

---

## Archivos clave

| Archivo | Descripción |
|---|---|
| `components/Dashboard.jsx` | Dashboard principal completo |
| `pages/[restaurant]/index.jsx` | Página por restaurante (autenticación por slug) |
| `pages/index.jsx` | Landing con PIN pad para entrar al panel |
| `pages/admin/index.jsx` | Panel admin — crear restaurantes |
| `pages/api/create-restaurant.js` | API route admin con service role |
| `pages/api/send-whatsapp.js` | Enviar mensajes WhatsApp vía Twilio |
| `pages/api/conversations.js` | Fetch conversaciones con service role (bypass RLS) |
| `pages/_app.jsx` | Metadata global: título, favicon, theme-color |
| `lib/supabase-client.js` | Cliente Supabase con anon key (browser) |
| `public/favicon.svg` | Favicon COVAI (bolt verde sobre fondo oscuro) |
| `public/apple-touch-icon.svg` | Icono iOS 180x180 |

---

## Base de datos (Supabase)

### Tablas principales

**`restaurants`**
- `id` (uuid), `name`, `slug`, `access_code` (PIN 4 dígitos), `phone_number`
- `twilio_account_sid`, `twilio_auth_token`, `twilio_whatsapp_from` (opcionales)

**`reservations`**
- `id`, `restaurant_slug`, `nombre`, `telefono`, `fecha`, `hora`, `personas`, `status`, `created_at`

**`conversations`**
- `id`, `restaurant_id` (uuid), `guest_phone`, `guest_name`, `message_text`, `message_direction` (in/out), `created_at`
- RLS: política `anon_read_conversations` con `using: true` — anon puede leer todo

**`conversation_states`**
- `id`, `restaurant_id`, `phone_number`, `state` (enum), `intent`, `draft` (jsonb), `context` (jsonb), `message_count`, `last_message_at`, `created_at`, `updated_at`
- RLS activado pero SIN políticas para anon → devuelve vacío (no error)

### Enum `conversation_state_enum`
`idle`, `waiting_name`, `waiting_date`, `waiting_time`, `waiting_people`, `confirming`, `confirmed`, `fallback_human`

---

## Edge Function: covai-processor (v20)

Deployada en Supabase. Procesa mensajes entrantes de WhatsApp.

### Fixes aplicados (v20)
- **Reset por tiempo:** Si pasaron +3h desde `last_message_at`, resetea `message_count = 0`
- **isNewFlow:** `const isNewFlow = conv.state === "idle" || !conv.state || conv.state === "fallback_human"` — evita acumulación de message_count entre conversaciones separadas
- **Loop detection guard:** Si `message_count > 8 && state !== "idle" && state !== "fallback_human"` → manda mensaje de fallback y resetea

### Selector de idioma (v19)
- `GREETING_RE` sin `context.language` → muestra selector 4 idiomas (no crea nuevo estado)
- Respuesta 1/español/2/english/3/italiano/4/français → guarda `context.language`, queda en `idle`
- `LANG_MAP` normaliza variantes de cada idioma

---

## Dashboard — diseño actual

### Filosofía visual
- **NO SaaS, NO fintech, NO startup**
- Calma operativa, hospitalidad premium, automatización invisible
- El dueño debe sentir MENOS ansiedad al abrir el dashboard

### Paleta de colores
| Token | Valor |
|---|---|
| Root background | `#EFEDE8` |
| Cards | `#F8F6F2` |
| Secondary panels | `#F2F0EC` |
| Borders | `#E2DED7` |
| Primary text | `#1E1C1A` |
| Secondary text | `#A09890` |
| Tertiary text | `#B5AFA7` |
| Verde (confirmado/activo) | `#4ade80` / `#3A6340` |
| Alerta (handoff) | `#C06050` / `#8A4030` |

### Estructura del dashboard
1. **Header:** Logo COVAI izquierda, nombre restaurante + "Sistema activo" centro, botón refresh derecha
2. **Timeline carousel:** Hoy → fin de mes, 7 días visibles, slide con CSS transform
3. **Status strip:** 4 métricas en línea — reservas hoy, próximos 7 días, este mes, última reserva hace X min
4. **Main 2 columnas (3:2):**
   - Izquierda: Reservas de hoy (lista con hora, nombre, teléfono, personas, badge estado)
   - Derecha: Chat WhatsApp (lista threads + conversación activa)

### Verde — uso INTENCIONAL únicamente
- Reservas confirmadas
- Sistema activo (dot en header)
- Read receipts (✓✓)
- Conteo unread

### Rojo/terracota — solo para
- Handoff (requiere atención humana)
- Errores críticos

---

## Variables de entorno

### `.env.local` (desarrollo)
```
NEXT_PUBLIC_ADMIN_PIN=1725
NEXT_PUBLIC_SUPABASE_URL=https://ptmfgyflyjkqjkzwrlnx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Railway (producción) — configurar manualmente en dashboard Railway
```
NEXT_PUBLIC_SUPABASE_URL=https://ptmfgyflyjkqjkzwrlnx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_ADMIN_PIN=1725   ← IMPORTANTE: agregar esto si falta
```

**⚠️ Si `/admin` dice "PIN incorrecto":** `NEXT_PUBLIC_ADMIN_PIN` no está seteado en Railway.

---

## Reglas de desarrollo

- Trabajar SOLO dentro de `/Users/Account/Downloads/COVAI/COVAIV3`
- NO overengineering, NO enterprise auth, NO abstractions innecesarias
- NO tocar: schema Supabase, Make, Twilio, multitenancy sin permiso explícito
- `SUPABASE_SERVICE_ROLE_KEY` solo en API routes server-side, nunca en cliente
- Git push a `main` → Railway autodeploya

---

## Fixes y decisiones tomadas

### Conversaciones WhatsApp vacías en producción
**Causa:** El anon key puede fallar silenciosamente con RLS en producción.
**Fix:** Creada `/pages/api/conversations.js` — usa service role server-side, bypassa RLS.
El Dashboard ahora llama `fetch('/api/conversations?restaurant_id=...')` en lugar de Supabase client directo.

### Scroll del chat
**Fix:** `chatMessagesRef` + `scrollTop = scrollHeight` + `setTimeout(0)` para esperar render.
Al cambiar de thread: scroll al fondo después de un tick.
Al nuevo mensaje: scroll solo si el usuario está cerca del fondo (<120px).

### message_count acumulado entre conversaciones
**Fix v20:** Reset por tiempo (>3h) + `isNewFlow` para detectar inicio de nueva conversación.

### Carousel días
- Datos: hoy → fin de mes actual (no solo 7 días fijos)
- Bug corregido: `calculateKPIs(todayRes || [], monthDays, ...)` — variable era `sevenDays` (renombrada a `monthDays`)

### Branding
- `pages/_app.jsx`: título "COVAI — Reservas", theme-color #EFEDE8, noindex
- `public/favicon.svg`: bolt verde sobre fondo oscuro `#1E1C1A`
- Eliminado: `🔔` notificaciones genéricas, emojis en datos operativos, "Ver todas" en verde decorativo

---

## Restaurante de prueba

- **Nombre:** Restaurante Prueba COVAI
- **Slug:** restaurante-prueba-covai
- **ID:** c5b47da8-0241-4e9d-bcdf-f5746f59e192
- **PIN acceso:** (ver en Supabase tabla `restaurants`, columna `access_code`)
- **Conversaciones en DB:** 42 mensajes del número +393312179219
