import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00.000Z`;
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  const [
    msgsRes,
    resRes,
    confRes,
    fallbackRes,
    activeNowRes,
    activeRestsRes,
  ] = await Promise.all([
    sb.from('conversations').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay),
    sb.from('reservations').select('*', { count: 'exact', head: true }).eq('fecha', today),
    sb.from('reservations').select('*', { count: 'exact', head: true }).eq('fecha', today).eq('status', 'confirmada'),
    sb.from('conversation_states').select('*', { count: 'exact', head: true }).eq('state', 'fallback_human'),
    sb.from('conversations').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
    sb.from('conversations').select('restaurant_id').gte('created_at', startOfDay),
  ]);

  const activeRestaurants = new Set(
    (activeRestsRes.data || []).map(r => r.restaurant_id)
  ).size;

  return res.status(200).json({
    msgsToday:          msgsRes.count     || 0,
    reservasToday:      resRes.count      || 0,
    confirmedToday:     confRes.count     || 0,
    fallbacks:          fallbackRes.count || 0,
    activeConversations: activeNowRes.count || 0,
    activeRestaurants,
  });
}
