import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { restaurant_id } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('conversations fetch error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data || []);
}
