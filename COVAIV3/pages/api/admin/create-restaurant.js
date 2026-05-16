import { createClient } from '@supabase/supabase-js';

// Server-side only — service role bypasses RLS.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone_number, twilio_account_sid, twilio_auth_token, twilio_whatsapp_from } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!phone_number || typeof phone_number !== 'string' || !phone_number.trim()) {
    return res.status(400).json({ error: 'phone_number is required' });
  }

  const restaurantName = name.trim();

  // ── 1. Unique PIN ────────────────────────────────────────────────────────
  let pin = null;
  for (let i = 0; i < 10; i++) {
    const candidate = generatePin();
    const { data } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('access_code', candidate)
      .maybeSingle();
    if (!data) { pin = candidate; break; }
  }
  if (!pin) return res.status(500).json({ error: 'Could not generate unique PIN. Try again.' });

  // ── 2. Unique slug ───────────────────────────────────────────────────────
  const baseSlug = generateSlug(restaurantName);
  let slug = null;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${Math.floor(10 + Math.random() * 90)}`;
    const { data } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) { slug = candidate; break; }
  }
  if (!slug) return res.status(500).json({ error: 'Could not generate unique slug. Try again.' });

  // ── 3. INSERT ────────────────────────────────────────────────────────────
  // Only fields without DB defaults are explicitly set here.
  // Everything else (timezone, opening_hours, max_capacity, active, etc.)
  // is handled by Supabase column defaults.
  const { data: restaurant, error: insertError } = await supabaseAdmin
    .from('restaurants')
    .insert({
      name: restaurantName,
      phone_number: phone_number.trim(),
      slug,
      access_code: pin,
      ...(twilio_account_sid ? { twilio_account_sid: twilio_account_sid.trim() } : {}),
      ...(twilio_auth_token ? { twilio_auth_token: twilio_auth_token.trim() } : {}),
      ...(twilio_whatsapp_from ? { twilio_whatsapp_from: twilio_whatsapp_from.trim() } : {}),
    })
    .select('id, name, slug, access_code, phone_number')
    .single();

  if (insertError) {
    console.error('createRestaurant error:', insertError);
    return res.status(500).json({ error: 'Insert failed', detail: insertError.message });
  }

  return res.status(201).json({
    id:           restaurant.id,
    name:         restaurant.name,
    slug:         restaurant.slug,
    access_code:  restaurant.access_code,
    phone_number: restaurant.phone_number,
  });
}
