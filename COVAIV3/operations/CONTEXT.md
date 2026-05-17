# COVAI Monitoring — Architectural Context

**Fecha:** May 18, 2026  
**Stage:** Pre-clientes (Piloto Alicante próximamente)  
**Criticality:** Operational trust must be built BEFORE customer 1

---

## PROBLEMA OPERACIONAL

COVAI es un sistema de reservas automatizado vía WhatsApp para restaurantes.

**Stack actual:**
- Meta/WABA → webhook → Make (3 módulos) → Supabase Edge Function → Postgres

**Risk real hoy:**
- Reservas "fantasma": Cliente recibe "✅ Reserva confirmada", restaurante nunca la ve
- Edge Function falla silenciosamente
- Webhook parsing errors rompen conversación
- Meta/WABA restricciones sin notificación
- Deduplicación incompleta en Edge Function

**Impacto:** 
Una sola falla = cliente enojado = startup muerto en semana 1.

No es problema técnico.
Es problema de **confianza operacional.**

---

## PRINCIPIOS DE DISEÑO

### ✅ QUÉ SÍ HACEMOS

- Detectar SOLO problemas reales y accionables
- Alertas extremadamente raras (máximo 1-2/semana)
- Cada alerta = 100% confiable, accionable en < 5 min
- Silencio por defecto (no notificar si OK)
- Documentación silenciosa (logs en Google Drive, no spam)
- Observabilidad pura (cero auto-fixes, cero auto-resets temprano)

### ❌ QUÉ NO HACEMOS

- Auto-remediation (esconde bugs reales)
- Auto-reset conversations (perder contexto válido)
- PDFs/documentos automáticos (ruido operacional)
- Anomaly detection sofisticada (threshold serían arbitrarios)
- Performance scoring (crea fatiga visual)
- Handoff rate analysis (sin suficientes datos reales)
- Rate limit alerts (paranoia pre-escala)
- Stuck conversation detection (aún no claro qué es "stuck")

---

## ARCHITECTURE

\`\`\`
Meta/WABA
  ↓ webhook JSON
Make.com (simple router)
  │ Module 1: Receive webhook
  │ Module 2: HTTP → Supabase
  │ Module 3: Send response via WhatsApp Cloud API
  ↓
Supabase Edge Function (covai-processor)
  │ • Language detection
  │ • State machine: idle→waiting_people→waiting_date→waiting_time→confirmation
  │ • Open


cat > operations/CONTEXT.md << 'EOF'
# COVAI Monitoring — Architectural Context

**Fecha:** May 18, 2026  
**Stage:** Pre-clientes (Piloto Alicante próximamente)  
**Criticality:** Operational trust must be built BEFORE customer 1

---

## PROBLEMA OPERACIONAL

COVAI es un sistema de reservas automatizado vía WhatsApp para restaurantes.

**Stack actual:**
- Meta/WABA → webhook → Make (3 módulos) → Supabase Edge Function → Postgres

**Risk real hoy:**
- Reservas "fantasma": Cliente recibe "✅ Reserva confirmada", restaurante nunca la ve
- Edge Function falla silenciosamente
- Webhook parsing errors rompen conversación
- Meta/WABA restricciones sin notificación
- Deduplicación incompleta en Edge Function

**Impacto:** 
Una sola falla = cliente enojado = startup muerto en semana 1.

No es problema técnico.
Es problema de **confianza operacional.**

---

## PRINCIPIOS DE DISEÑO

### ✅ QUÉ SÍ HACEMOS

- Detectar SOLO problemas reales y accionables
- Alertas extremadamente raras (máximo 1-2/semana)
- Cada alerta = 100% confiable, accionable en < 5 min
- Silencio por defecto (no notificar si OK)
- Documentación silenciosa (logs en Google Drive, no spam)
- Observabilidad pura (cero auto-fixes, cero auto-resets temprano)

### ❌ QUÉ NO HACEMOS

- Auto-remediation (esconde bugs reales)
- Auto-reset conversations (perder contexto válido)
- PDFs/documentos automáticos (ruido operacional)
- Anomaly detection sofisticada (threshold serían arbitrarios)
- Performance scoring (crea fatiga visual)
- Handoff rate analysis (sin suficientes datos reales)
- Rate limit alerts (paranoia pre-escala)
- Stuck conversation detection (aún no claro qué es "stuck")

---

## ARCHITECTURE

\`\`\`
Meta/WABA
  ↓ webhook JSON
Make.com (simple router)
  │ Module 1: Receive webhook
  │ Module 2: HTTP → Supabase
  │ Module 3: Send response via WhatsApp Cloud API
  ↓
Supabase Edge Function (covai-processor)
  │ • Language detection
  │ • State machine: idle→waiting_people→waiting_date→waiting_time→confirmation
  │ • OpenAI for date parsing (normalizeDate)
  │ • Deduplication check
  │ • Insert reservation if confirmed
  │ • Fallback to human after 8 messages
  ↓
Postgres (ptmfgyflyjkqjkzwrlnx)
  │ conversations: ALL messages (in/out)
  │ reservations: Confirmed bookings
  │ conversation_states: FSM state + draft + context
  │ processed_message_ids: Deduplication
  │ error_logs: Explicit errors
  ↓
n8n (THIS PROJECT)
  └─ Health monitoring workflows
  └─ Telegram alerts
  └─ Google Drive logging
\`\`\`

**Key:** Edge Function is source of truth for system health.

---

## SCHEMA (RELEVANT TO MONITORING)

### conversations
\`\`\`sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  restaurant_id UUID,
  guest_phone TEXT,
  guest_name TEXT,
  message_text TEXT,
  message_direction TEXT, -- 'in' or 'out'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
\`\`\`

### reservations
\`\`\`sql
CREATE TABLE reservations (
  id UUID PRIMARY KEY,
  restaurant_slug TEXT,
  telefono TEXT,
  nombre TEXT,
  fecha DATE,
  hora TIME,
  personas INT,
  status TEXT, -- 'confirmada' | 'cancelada'
  source TEXT, -- 'whatsapp' | 'manual'
  created_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
\`\`\`

### error_logs
\`\`\`sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY,
  restaurant_id UUID,
  error_code INT,
  error_type TEXT,
  error_message TEXT,
  created_at TIMESTAMP
);
\`\`\`

### conversation_states
\`\`\`sql
CREATE TABLE conversation_states (
  id UUID PRIMARY KEY,
  restaurant_id UUID,
  phone_number TEXT,
  state TEXT,
  intent TEXT,
  draft JSONB,
  context JSONB,
  message_count INT,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
\`\`\`

### processed_message_ids
\`\`\`sql
CREATE TABLE processed_message_ids (
  id UUID PRIMARY KEY,
  message_id TEXT UNIQUE,
  phone TEXT,
  created_at TIMESTAMP
);
\`\`\`

---

## SIGNALS VÁLIDAS (SOLO ESTAS 4)

### SIGNAL 1: Webhook-to-Reservation Mismatch

**What it detects:**
Edge Function receives messages but doesn't convert to reservations.
Indicates internal system failure.

**Alert threshold:**
IF webhook_count > 5 AND reservation_count = 0
  → "⚠️ MEDIUM: [N] webhooks, 0 reservations"
  → Indicates: Edge Function not processing correctly
  
IF webhook_count > 10 AND conversion_rate < 20%
  → "⚠️ MEDIUM: Conversion rate [X%]"
  → Indicates: High fallback rate, system struggling

**Why it matters:**
If messages arrive but reservations don't, customers won't be in the system.

---

### SIGNAL 2: Edge Function Errors

**What it detects:**
System failing internally. Customers hitting errors or fallback.

**Alert threshold:**
IF total_errors > 3 in 1 hour
  → "🚨 CRITICAL: [N] errors in Edge Function"
  
IF server_errors > 2
  → "🚨 CRITICAL: Server errors in Edge Function"
  
IF fallback_human_count > 5 in 1 hour
  → "⚠️ MEDIUM: [N] customers sent to human handoff"

**Why it matters:**
Errors compound. Early detection = faster fix.

---

### SIGNAL 3: Reservation Integrity (EXISTENCIAL)

**What it detects:**
Customer received "✅ Reserva confirmada" but reservation doesn't exist in DB.
Customer thinks they booked. Restaurant never sees them.

**Alert threshold:**
IF ghost_reservations > 0
  → "🚨 CRITICAL: Ghost Reservations [N]"
  → ACTION: Manual investigation immediately

**Why it matters:**
This is THE existential risk. One ghost reservation = customer churn = startup dead.

---

### SIGNAL 4: Webhook Parsing Errors

**What it detects:**
Meta sending invalid JSON or format changed.
Integration is breaking.

**Alert threshold:**
IF parsing_errors > 3 in 1 hour
  → "⚠️ MEDIUM: Webhook parsing errors [N]"
  → ACTION: Check Make webhook URL and payload format

**Why it matters:**
If webhook parsing fails, NO messages get processed.

---

## CRITICAL OPERATING RULES

1. **Silence is good**
   If no Telegram alert = system OK.
   Don't open Supabase "just to check". Trust the monitor.

2. **Every alert must be actionable in < 5 min**
   If you can't do something about it in 5 min, don't alert on it.

3. **Ghost reservations = DROP EVERYTHING**
   If Signal 3 triggers, all other work stops.
   This is existential.

4. **Log everything, alert rarely**
   Google Drive gets full logs. Telegram gets only critical.

5. **No premature optimization**
   Observe > understand > fix > optimize.
   Not: guess > build > deploy.

---

**Built:** May 18, 2026  
**For:** COVAI V3 — Operational Trust
