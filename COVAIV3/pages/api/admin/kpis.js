import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// created_at is stored without timezone but represents UTC
function parseUtc(str) {
  return new Date(str.replace(' ', 'T') + 'Z');
}

function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getLocalDayAndMinutes(utcDate, timezone) {
  // Use two separate formatters to avoid hour12:false returning "24" for midnight in some V8 versions
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const timeFmt    = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });

  const weekday = weekdayFmt.format(utcDate).toLowerCase().slice(0, 3);
  const timeParts = timeFmt.formatToParts(utcDate);
  const hour   = parseInt(timeParts.find(p => p.type === 'hour').value,   10) % 24;
  const minute = parseInt(timeParts.find(p => p.type === 'minute').value, 10);
  return { weekday, minutes: hour * 60 + minute };
}

function isOutsideHours(utcDate, timezone, opening_hours) {
  if (!opening_hours) return false;
  const { weekday, minutes } = getLocalDayAndMinutes(utcDate, timezone || 'Europe/Madrid');
  const day = opening_hours[weekday];
  if (!day) return true; // closed that day = fuera de horario

  if (day.dinner_open) {
    // Servicio partido
    const inLunch  = minutes >= toMinutes(day.open)        && minutes < toMinutes(day.close);
    const inDinner = minutes >= toMinutes(day.dinner_open) && minutes < toMinutes(day.dinner_close);
    return !inLunch && !inDinner;
  }
  // Servicio continuo
  return minutes < toMinutes(day.open) || minutes >= toMinutes(day.close);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [totalRes, recentRes, restaurantsRes] = await Promise.all([
    sb.from('reservations').select('*', { count: 'exact', head: true }),
    sb.from('reservations').select('created_at, status, restaurant_slug').gte('created_at', since90),
    sb.from('restaurants').select('slug, timezone, opening_hours'),
  ]);

  const total   = totalRes.count || 0;
  const recent  = recentRes.data || [];
  const restMap = Object.fromEntries(
    (restaurantsRes.data || []).map(r => [r.slug, r])
  );

  let fueraDeHorario = 0;
  let recuperados    = 0;

  for (const r of recent) {
    const rest = restMap[r.restaurant_slug];
    if (!rest) continue;
    const utcDate = parseUtc(r.created_at);
    if (isOutsideHours(utcDate, rest.timezone, rest.opening_hours)) {
      fueraDeHorario++;
      if (r.status === 'confirmada') recuperados++;
    }
  }

  const confirmed    = recent.filter(r => r.status === 'confirmada').length;
  const pctAuto      = recent.length > 0 ? Math.round((confirmed / recent.length) * 100) : 0;

  const minAhorrados   = total * 3;
  const horas          = Math.floor(minAhorrados / 60);
  const mins           = minAhorrados % 60;
  const tiempoAhorrado = horas > 0 ? `${horas}h ${mins}m` : `${mins}m`;

  return res.status(200).json({
    reservasTotales:  total,
    fueraDeHorario,
    recuperados,
    pctAutomaticas:   pctAuto,
    reservasWhatsapp: total,
    tiempoAhorrado,
  });
}
