import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurant_id, to_phone, message_text, guest_name } = req.body;

  if (!restaurant_id || !to_phone || !message_text?.trim()) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Obtener credenciales Twilio del restaurante
  const { data: restaurant, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_from')
    .eq('id', restaurant_id)
    .single();

  if (restErr || !restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const { twilio_account_sid, twilio_auth_token, twilio_whatsapp_from } = restaurant;

  if (!twilio_account_sid || !twilio_auth_token || !twilio_whatsapp_from) {
    return res.status(400).json({ error: 'Twilio credentials not configured for this restaurant' });
  }

  // Enviar mensaje via Twilio
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio_account_sid}/Messages.json`;
  const toNumber = to_phone.startsWith('whatsapp:') ? to_phone : `whatsapp:${to_phone}`;

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${twilio_account_sid}:${twilio_auth_token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: twilio_whatsapp_from,
      To: toNumber,
      Body: message_text.trim(),
    }),
  });

  const twilioData = await twilioRes.json();

  if (!twilioRes.ok) {
    console.error('Twilio error:', twilioData);
    return res.status(502).json({ error: twilioData.message || 'Twilio send failed' });
  }

  // Guardar en conversations
  await supabaseAdmin.from('conversations').insert({
    restaurant_id,
    guest_phone: to_phone,
    guest_name: guest_name || to_phone,
    message_text: message_text.trim(),
    message_direction: 'out',
  });

  return res.status(200).json({ ok: true, sid: twilioData.sid });
}
