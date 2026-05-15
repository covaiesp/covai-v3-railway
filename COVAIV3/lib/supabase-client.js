import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export const loginWithPin = async (pin) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .eq('access_code', pin)
    .single();

  if (error) throw new Error('PIN inválido');
  return data;
};

export const getReservations = async (restaurantId, date) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('reservation_date', date)
    .order('reservation_time', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getConversations = async (restaurantId) => {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

