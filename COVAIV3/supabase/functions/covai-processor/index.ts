import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

type State = "idle" | "waiting_people" | "waiting_date" | "waiting_time" | "waiting_name" | "waiting_confirmation" | "waiting_cancel" | "waiting_cancel_confirm" | "fallback_human";

interface ConvState {
  state: State;
  intent: string | null;
  draft: Record<string, unknown>;
  context: Record<string, unknown>;
  message_count: number;
}

const VALID_TIMES = ["13:00","13:30","14:00","14:30","15:00","15:30","20:00","20:30","21:00","21:30","22:00","22:30"];
const YES = ["si","sí","s","ok","vale","confirmo","yes","claro","correcto","confirmamos","dale","perfecto","genial","obvio","confirmar","confirmá"];
const NO = ["no","n","cancelar","cancel","mejor no","olvidalo","olvídalo","ya no"];

const GREETING_RE = /^(hola|hello|hi|hey|buongiorno|buonasera|buenas?(\s*(tardes?|noches?|d[ií]as?))?|bonjour|bonsoir|ciao|salut|good\s*(morning|afternoon|evening|day)|ola)[\s!.]*$/i;
const THANKS_RE   = /^(gracias|thank\s*(you|u)?|grazie|merci|de nada|prego|perfecto|genial|vale|np|ok|okay|👍|😊|🙏)[\s!.]*$/i;

const LANG_SELECT_MSG =
  "Hola 👋\n\nPuedes continuar en:\n\n1️⃣ Español\n2️⃣ English\n3️⃣ Italiano\n4️⃣ Français";

const LANG_MAP: Record<string, string> = {
  "1": "es", "español": "es", "espanol": "es", "spanish": "es",
  "2": "en", "english": "en", "inglés": "en", "ingles": "en",
  "3": "it", "italiano": "it", "italian": "it",
  "4": "fr", "français": "fr", "frances": "fr", "french": "fr", "francés": "fr",
};

function isYes(t: string): boolean {
  const l = t.toLowerCase().trim();
  return YES.some(w => l === w || l.includes(w));
}

function isNo(t: string): boolean {
  const l = t.toLowerCase().trim();
  return NO.some(w => l === w || l.includes(w));
}

function normalizeTime(t: string): string | null {
  const l = t.toLowerCase().replace(/\s+/g, "");
  const p = l.match(/(?:a\s*las|tipo|a\s*eso\s*de|las|horas?)?\s*(\d{1,2})[:.]?(\d{2})?(?:\s*horas?)?/);
  if (!p) return null;
  const h = parseInt(p[1]);
  const m = p[2] ? parseInt(p[2]) : 0;
  if (h > 23 || m > 59) return null;
  const c = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return VALID_TIMES.includes(c) ? c : null;
}

function parsePeople(t: string): number | null {
  const l = t.toLowerCase();
  if (/\b(personas|people|gente|comensales|nosotros|somos|para|mesa)\b/.test(l)) {
    const match = l.match(/\b(\d{1,2})\b/);
    if (match) {
      const n = parseInt(match[1]);
      if (n >= 1 && n <= 20) return n;
    }
  }
  const singleNum = l.match(/^(\d{1,2})$/);
  if (singleNum) {
    const n = parseInt(singleNum[1]);
    return (n >= 1 && n <= 20) ? n : null;
  }
  return null;
}

async function normalizeDate(t: string, k: string): Promise<string | null> {
  const d = new Date().toISOString().split("T")[0];
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${k}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", max_tokens: 30, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Hoy es ${d}. Convierte a YYYY-MM-DD. Solo futuro/hoy. JSON: {"date":"..."} o {"date":null}` },
        { role: "user", content: t }
      ]
    })
  });
  const x = await r.json();
  try { return JSON.parse(x.choices[0].message.content).date ?? null; } catch { return null; }
}

async function classifyIntent(t: string, k: string): Promise<string> {
  const l = t.toLowerCase();
  if (/cancel|anul|quitar|borrar/.test(l)) return "cancel";
  if (/modif|cambi|mover/.test(l)) return "modify";
  if (/quiero reservar|reservar|reserva|mesa para/.test(l)) return "new_reservation";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${k}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", max_tokens: 15, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: '{"intent":"new_reservation"|"cancel"|"modify"|"other"}' },
        { role: "user", content: t }
      ]
    })
  });
  const x = await r.json();
  try { return JSON.parse(x.choices[0].message.content).intent ?? "other"; } catch { return "other"; }
}

async function processMessage(
  p: string, m: string, c: ConvState, r: string, slug: string, k: string, s: ReturnType<typeof createClient>
) {
  const d = { ...c.draft };
  const x = { ...c.context };
  let y = "", z: State = c.state, i = c.intent, ir = false;
  let cr: string | null = null;

  // Solo inferencia de personas — la hora y la fecha se recogen en su estado correspondiente
  // para evitar que mensajes ambiguos (ej: "22") contaminen d.time antes de tener d.date
  const ep = parsePeople(m);
  if (ep && !d.people) d.people = ep;

  if (z === "idle" || !z) {
    if (!x.language) {
      const langKey = m.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const selectedLang = LANG_MAP[langKey];
      if (selectedLang) {
        return { reply: "¡Hola! 😊 ¿En qué puedo ayudarte?\n• Hacer una reserva\n• Cancelar una reserva", next_state: "idle" as State, draft: d, context: { ...x, language: selectedLang }, intent: null, insert_reservation: false, cancel_reservation_id: null };
      }
    }

    if (GREETING_RE.test(m.trim()) && !x.language) {
      return { reply: LANG_SELECT_MSG, next_state: "idle" as State, draft: d, context: x, intent: null, insert_reservation: false, cancel_reservation_id: null };
    }

    if (GREETING_RE.test(m.trim())) {
      return { reply: "¡Hola! 😊 ¿En qué puedo ayudarte?\n• Hacer una reserva\n• Cancelar una reserva", next_state: "idle" as State, draft: d, context: x, intent: null, insert_reservation: false, cancel_reservation_id: null };
    }
    if (THANKS_RE.test(m.trim())) {
      return { reply: "¡Con mucho gusto! 😊 Si necesitas algo más, aquí estaré.", next_state: "idle" as State, draft: d, context: x, intent: null, insert_reservation: false, cancel_reservation_id: null };
    }
    i = await classifyIntent(m, k);
    if (i === "new_reservation") { z = "waiting_people"; y = "¡Perfecto! 👌\n¿Para cuántas personas es la reserva?"; }
    else if (i === "cancel") { z = "waiting_cancel"; y = "Voy a buscar tus reservas activas..."; }
    else { z = "fallback_human"; y = "Un momento, te conecto con nuestro equipo 🙏"; }
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_people") {
    const n = (d.people as number) || parsePeople(m);
    if (n) {
      d.people = n;
      // NO llamar normalizeDate aquí — el flujo es siempre: personas → fecha → hora → nombre
      // normalizeDate en el mensaje de personas causa que GPT asuma fecha desde un número ambiguo
      z = "waiting_date";
      y = `Perfecto, ${n} personas 👍\n\n¿Para cuándo sería la reserva?`;
    } else { y = "No entendí el número 🤔\nEscribe solo el número: *2*"; }
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_date") {
    const dt = await normalizeDate(m, k);
    if (dt) {
      d.date = dt;
      if (d.time) { z = "waiting_name"; y = `Perfecto 👍\n\n¿A nombre de quién?`; }
      else { z = "waiting_time"; y = `Perfecto 👍\n\n¿A qué hora te gustaría?`; }
    } else { y = "No entendí esa fecha 📅\nPrueba: *mañana*, *viernes*, *15 de junio*"; }
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_time") {
    const t = normalizeTime(m);
    if (t) { d.time = t; z = "waiting_name"; y = `Perfecto 👍\n\n¿A nombre de quién?`; }
    else { y = `Esa hora no está disponible 🕐\n*Comida:* 13:00 · 14:00\n*Cena:* 20:00 · 21:00`; }
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_name") {
    const nm = m.trim().slice(0, 50);
    if (nm.length < 2) { y = "Necesito al menos un nombre 😊"; return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null }; }
    d.name = nm;
    z = "waiting_confirmation";
    const dft = d as Record<string, unknown>;
    const df = new Date(`${dft.date}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    y = `Perfecto 😊\n\nReserva para ${dft.people} personas\n${df}\n${dft.time}\n\n¿Confirmamos?`;
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_confirmation") {
    if (isYes(m)) {
      const dft = d as Record<string, unknown>;
      const { data: dup } = await s.from("reservations")
        .select("id")
        .eq("restaurant_slug", slug)
        .eq("telefono", p)
        .eq("fecha", dft.date)
        .maybeSingle();
      if (dup) { y = "⚠️ Ya tienes reserva ese día."; z = "idle"; }
      else {
        ir = true;
        z = "idle";
        const df = new Date(`${dft.date}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
        y = `✅ *¡Reserva confirmada!*\n👤 ${dft.name}\n📅 ${df}\n🕐 ${dft.time}\n👥 ${dft.people}\n\nTe esperamos 😊`;
      }
    } else if (isNo(m)) { z = "idle"; y = "Reserva descartada. 👋"; }
    else { y = "Responde *sí* o *no*"; }
    return { reply: y, next_state: z, draft: (z === "idle" && !ir) ? {} : d, context: x, intent: z === "idle" ? null : i, insert_reservation: ir, cancel_reservation_id: null };
  }

  if (z === "waiting_cancel") {
    const { data: res } = await s.from("reservations")
      .select("id,nombre,personas,fecha,hora")
      .eq("restaurant_slug", slug)
      .eq("telefono", p)
      .eq("status", "confirmada")
      .gte("fecha", new Date().toISOString().split("T")[0])
      .limit(1);
    if (!res || res.length === 0) { z = "idle"; y = "No encontré reservas activas 🔍"; }
    else {
      const rv = res[0] as Record<string, unknown>;
      x.reservation_id = rv.id;
      z = "waiting_cancel_confirm";
      const df = new Date(`${rv.fecha}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
      y = `Encontré:\n📅 ${df}\n🕐 ${String(rv.hora).slice(0, 5)}\n👥 ${rv.personas}\n👤 ${rv.nombre}\n\n¿Cancelar? *sí* o *no*`;
    }
    return { reply: y, next_state: z, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  if (z === "waiting_cancel_confirm") {
    if (isYes(m)) { cr = x.reservation_id as string; z = "idle"; y = "✅ Reserva cancelada.\n\nSi quieres reservar de nuevo, aquí estaré 😊"; }
    else if (isNo(m)) { z = "idle"; y = "Tu reserva sigue activa. 👍"; }
    else { y = "Responde *sí* o *no*"; }
    return { reply: y, next_state: z, draft: d, context: {}, intent: null, insert_reservation: false, cancel_reservation_id: cr };
  }

  if (z === "fallback_human") {
    if (GREETING_RE.test(m.trim())) {
      return { reply: "¡Hola! 😊 ¿En qué puedo ayudarte?\n• Hacer una reserva\n• Cancelar una reserva", next_state: "idle" as State, draft: {}, context: {}, intent: null, insert_reservation: false, cancel_reservation_id: null };
    }
    if (THANKS_RE.test(m.trim())) {
      return { reply: "¡Con mucho gusto! 😊", next_state: "fallback_human" as State, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
    }
    const fi = await classifyIntent(m, k);
    if (fi === "new_reservation") {
      return { reply: "¡Perfecto! 👌\n¿Para cuántas personas es la reserva?", next_state: "waiting_people" as State, draft: {}, context: {}, intent: "new_reservation", insert_reservation: false, cancel_reservation_id: null };
    }
    if (fi === "cancel") {
      return { reply: "Voy a buscar tus reservas activas...", next_state: "waiting_cancel" as State, draft: {}, context: {}, intent: "cancel", insert_reservation: false, cancel_reservation_id: null };
    }
    return { reply: "Un momento, te conecto con nuestro equipo 🙏", next_state: "fallback_human" as State, draft: d, context: x, intent: i, insert_reservation: false, cancel_reservation_id: null };
  }

  return { reply: "¿En qué puedo ayudarte?", next_state: "idle" as State, draft: {}, context: {}, intent: null, insert_reservation: false, cancel_reservation_id: null };
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-covai-key") !== Deno.env.get("COVAI_API_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { phone, message_id, message_text, restaurant_id } = body;
  if (!phone || !message_text || !restaurant_id || !message_id) {
    return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ok = Deno.env.get("OPENAI_API_KEY")!;

  const { data: seen } = await sb.from("processed_message_ids").select("id").eq("message_id", message_id).maybeSingle();
  if (seen) return new Response(JSON.stringify({ deduplicated: true }), { status: 200 });
  await sb.from("processed_message_ids").insert({ message_id, phone });

  const { data: restRow } = await sb.from("restaurants").select("slug").eq("id", restaurant_id).maybeSingle();
  const slug = (restRow as Record<string, string> | null)?.slug ?? "";

  const { data: row } = await sb.from("conversation_states")
    .select("state,intent,draft,context,message_count,last_message_at")
    .eq("restaurant_id", restaurant_id)
    .eq("phone_number", phone)
    .maybeSingle();

  const conv: ConvState = (row as ConvState | null) ?? { state: "idle", intent: null, draft: {}, context: {}, message_count: 0 };

  // guestName calculado ANTES del reset — preserva el nombre del draft previo si lo había
  const guestName = (conv.draft as Record<string, unknown>)?.name as string || phone;

  // ── v23: HARD RESET si inactivo más de 1 hora ─────────────────────────────────
  // Resetea TODO el estado conversacional activo.
  // NO toca: historial de mensajes, reservas, logs ni métricas.
  const INACTIVITY_MS = 60 * 60 * 1000; // 1 hora exacta
  const lastAt = (row as Record<string, unknown> | null)?.last_message_at as string | undefined;
  if (lastAt && (Date.now() - new Date(lastAt).getTime()) > INACTIVITY_MS) {
    conv.state         = "idle";
    conv.intent        = null;
    conv.draft         = {};
    conv.context       = {};
    conv.message_count = 0;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  await sb.from("conversations").insert({
    restaurant_id, guest_phone: phone, guest_name: guestName,
    message_text, message_direction: "in"
  });

  if ((conv.message_count ?? 0) > 8 && conv.state !== "idle" && conv.state !== "fallback_human") {
    const reply = "Llevamos un buen rato y quiero asegurarme de ayudarte bien. Te conecto con nuestro equipo 🙏";
    await sb.from("conversation_states").upsert({
      restaurant_id, phone_number: phone, state: "fallback_human",
      intent: conv.intent, draft: conv.draft, context: conv.context,
      message_count: (conv.message_count ?? 0) + 1,
      last_message_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,phone_number" });
    await sb.from("conversations").insert({
      restaurant_id, guest_phone: phone, guest_name: guestName,
      message_text: reply, message_direction: "out"
    });
    return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
  }

  const res = await processMessage(phone, message_text, conv, restaurant_id, slug, ok, sb);

  const isNewFlow = conv.state === "idle" || !conv.state || conv.state === "fallback_human";
  const nextCount = res.next_state === "idle" ? 0 : isNewFlow ? 1 : (conv.message_count ?? 0) + 1;

  await sb.from("conversation_states").upsert({
    restaurant_id, phone_number: phone,
    state: res.next_state, intent: res.intent,
    draft: res.draft, context: res.context,
    message_count: nextCount,
    last_message_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }, { onConflict: "restaurant_id,phone_number" });

  if (res.insert_reservation) {
    const dr = res.draft as Record<string, unknown>;
    const { error: insertErr } = await sb.from("reservations").insert({
      restaurant_slug: slug, telefono: phone,
      nombre: dr.name, personas: dr.people,
      fecha: dr.date, hora: dr.time,
      status: "confirmada", source: "whatsapp"
    });
    if (insertErr) console.error("reservations insert failed:", JSON.stringify(insertErr));
  }

  if (res.cancel_reservation_id) {
    await sb.from("reservations").update({
      status: "cancelada", cancelled_at: new Date().toISOString()
    }).eq("id", res.cancel_reservation_id).eq("restaurant_slug", slug);
  }

  if (res.reply) {
    const updatedName = (res.draft as Record<string, unknown>)?.name as string || guestName;
    await sb.from("conversations").insert({
      restaurant_id, guest_phone: phone, guest_name: updatedName,
      message_text: res.reply, message_direction: "out"
    });
  }

  return new Response(JSON.stringify({ reply: res.reply }), { headers: { "Content-Type": "application/json" } });
});
