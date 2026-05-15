# COVAI Dashboard

Dashboard minimal operacional para COVAI - Sistema de Reservas WhatsApp

## 🚀 Quick Start

### 1. Clonar/Descargar
```bash
unzip covai-final-dashboard.zip
cd covai-final-dashboard
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables
```bash
cp .env.local.example .env.local
# Editar .env.local con tus credenciales de Supabase
```

### 4. Ejecutar localmente
```bash
npm run dev
# Abre http://localhost:3000
```

## 📋 Estructura

```
covai-final-dashboard/
├── pages/
│   ├── login.jsx .......................... Login email/password
│   ├── admin/
│   │   └── index.jsx ..................... Admin dashboard
│   └── [restaurant]/
│       └── index.jsx ..................... Dashboard restaurante
├── components/
│   ├── DashboardHTML.jsx ................. Renderiza dashboard actual
│   ├── ReservationModal.jsx .............. Modal nueva reserva
│   └── CancelReservationModal.jsx ........ Modal cancelar reserva
├── lib/
│   ├── supabase-client.js ................ Cliente Supabase
│   └── middleware.js ..................... Protección de rutas
├── .env.local.example .................... Template de variables
└── vercel.json ........................... Config Vercel
```

## 🔐 Autenticación

### Login simple (email/password)
- Usuario: `admin@covai.es`
- Contraseña: Configurable en Supabase Auth

### Redirects automáticos
- **Admin** → `/admin`
- **Restaurante** → `/[restaurant_slug]`

## 🛣️ Rutas

| Ruta | Acceso | Función |
|------|--------|---------|
| `/login` | Público | Login |
| `/admin` | Admin | Admin dashboard |
| `/[restaurant]` | Restaurante + Admin | Dashboard restaurante |

## 📊 Funcionalidades

### Login (`/login`)
- Email + Password simple
- Redirect automático según rol
- Validación contra tabla `users` en Supabase

### Restaurant Dashboard (`/[restaurant]`)
- Dashboard actual (HTML estático embebido)
- ➕ Botón "Nueva Reserva" (modal)
- ❌ Botón "Cancelar Reserva" (modal)
- Protección: no puede ver otro restaurant

### Admin Dashboard (`/admin`)
- KPIs: restaurantes, mensajes, reservas, uptime
- Estado sistema: WhatsApp, Supabase, OpenAI
- Reservas recientes
- Errores recientes

## 💾 Base de datos (Supabase)

### Tabla `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  role TEXT ('admin' | 'restaurant'),
  restaurant_slug TEXT,
  created_at TIMESTAMP
);
```

### Tabla `reservations`
```sql
CREATE TABLE reservations (
  id UUID PRIMARY KEY,
  restaurant_slug TEXT,
  nombre TEXT,
  telefono TEXT,
  fecha DATE,
  hora TIME,
  personas INT,
  notas TEXT,
  status TEXT ('confirmada' | 'cancelada'),
  source TEXT ('whatsapp' | 'manual'),
  created_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
```

### Tabla `error_logs` (opcional)
```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY,
  restaurant_slug TEXT,
  message TEXT,
  created_at TIMESTAMP
);
```

## 🚀 Deploy a Vercel

### Opción A: ZIP directo (SIN GitHub)
1. Generar ZIP:
   ```bash
   zip -r covai-dashboard.zip . \
     -x "node_modules/*" ".next/*" ".git/*"
   ```

2. En Vercel:
   - https://vercel.com/new
   - "Import Project" → Drag & drop ZIP
   - Configurar variables de entorno
   - Deploy automático

### Opción B: GitHub
1. Push a GitHub
2. Conectar repo en Vercel
3. Variables de entorno en Settings
4. Deploy automático

## 🔧 Variables de Entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://ptmfgyflyjkqjkzwrlnx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

⚠️ **IMPORTANTE**: 
- Anon key es PÚBLICA (segura en frontend)
- Service role key es SECRETA (solo servidor)

## ⚠️ Limitaciones/Pendientes

- [ ] Dashboard actual (`DashboardHTML.jsx`) es placeholder
  - **Necesitas:** Copiar contenido de `dashboard.html` original
  - Reemplazar en función `getDashboardHTML()`

- [ ] Sin sistema de reservations en tiempo real
  - Usa polling cada 5s para refresh

- [ ] Sin gráficos avanzados
  - Métricas son hardcoded/básicas

## 🔒 Seguridad

✅ Protecciones implementadas:
- Auth obligatorio para `/admin` y `/[restaurant]`
- Restaurante NO puede ver otro slug
- Admin puede ver todos
- Variables sensibles en `.env.local` (no versionadas)

❌ Aún pendiente:
- Row-level security (RLS) en Supabase para datos
- Rate limiting en API
- Validación server-side de permisos

## 📞 Soporte

Para problemas:
1. Verificar logs en Vercel
2. Revisar Supabase Auth en console
3. Validar variables de entorno

## 📝 Changelog

**v1.0.0** (May 14, 2026)
- ✅ Login implementado
- ✅ Admin dashboard basic
- ✅ Restaurant dashboard
- ✅ Modales: nueva reserva + cancelar
- ✅ Vercel ready

---

**COVAI v3** - Sistema de Reservas WhatsApp
