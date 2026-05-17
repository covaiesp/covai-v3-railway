import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [convsRes, resRes] = await Promise.all([
    sb.from('conversations')
      .select('id, guest_phone, guest_name, message_text, message_direction, created_at, restaurant_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
    sb.from('reservations')
      .select('id, nombre, telefono, hora, personas, status, created_at, restaurant_slug')
      .eq('fecha', today)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  // Build restaurant_id → name map from restaurants table
  const { data: rests } = await sb.from('restaurants').select('id, name');
  const restMap = Object.fromEntries((rests || []).map(r => [r.id, r.name]));

  const msgs = (convsRes.data || []).map(m => ({
    id: `msg-${m.id}`,
    type: m.message_direction === 'in' ? 'msg_in' : 'msg_out',
    ts: m.created_at,
    phone: m.guest_phone,
    name: m.guest_name,
    text: (m.message_text || '').slice(0, 90),
    restaurant: restMap[m.restaurant_id] || '—',
  }));

  const reservas = (resRes.data || []).map(r => ({
    id: `res-${r.id}`,
    type: 'reservation',
    ts: r.created_at,
    phone: r.telefono,
    name: r.nombre,
    text: `${r.nombre} — ${r.personas} pers. — ${r.hora}`,
    restaurant: r.restaurant_slug || '—',
    status: r.status,
  }));

  const feed = [...msgs, ...reservas]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 60);

  return res.status(200).json(feed);
}
