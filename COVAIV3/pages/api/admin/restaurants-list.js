import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = `${today}T00:00:00.000Z`;

  // Obtener restaurantes
  const { data: restaurants } = await sb
    .from('restaurants')
    .select('id, name, slug, phone_number')
    .order('name');

  if (!restaurants) return res.status(200).json([]);

  // Para cada restaurante, obtener métricas del día
  const results = await Promise.all(restaurants.map(async (r) => {
    const [msgsRes, resRes, fallbackRes, lastRes] = await Promise.all([
      sb.from('conversations').select('*', { count: 'exact', head: true })
        .eq('restaurant_id', r.id).gte('created_at', startOfDay),
      sb.from('reservations').select('*', { count: 'exact', head: true })
        .eq('restaurant_slug', r.slug).eq('fecha', today),
      sb.from('conversation_states').select('*', { count: 'exact', head: true })
        .eq('restaurant_id', r.id).eq('state', 'fallback_human'),
      sb.from('conversations').select('created_at')
        .eq('restaurant_id', r.id).order('created_at', { ascending: false }).limit(1),
    ]);

    const lastActivity = lastRes.data?.[0]?.created_at || null;
    const msgsToday = msgsRes.count || 0;
    const fallbacks = fallbackRes.count || 0;

    // Status: rojo si hay fallbacks, amarillo si sin actividad hoy, verde si activo
    let status = 'idle';
    if (fallbacks > 0) status = 'alert';
    else if (msgsToday > 0) status = 'active';

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      phone: r.phone_number,
      msgsToday,
      reservasToday: resRes.count || 0,
      fallbacks,
      lastActivity,
      status,
    };
  }));

  // Ordenar: alertas primero, luego activos, luego inactivos
  results.sort((a, b) => {
    const order = { alert: 0, active: 1, idle: 2 };
    return order[a.status] - order[b.status];
  });

  return res.status(200).json(results);
}
