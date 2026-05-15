import { supabase } from './supabase-client';

export async function requireAuth(req, res) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  return session;
}

export async function requireAdmin(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();
  
  if (userData?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  return session;
}

export async function getRestaurantAccess(restaurantSlug) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;
  
  const { data: userData } = await supabase
    .from('users')
    .select('role, restaurant_slug')
    .eq('id', user.id)
    .single();
  
  // Admin can access all
  if (userData?.role === 'admin') return true;
  
  // User can only access their own restaurant
  if (userData?.restaurant_slug === restaurantSlug) return true;
  
  return false;
}
