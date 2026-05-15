import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/login');
      return;
    }

    setUser(user);
    setLoading(false);
  };

  if (loading) return <div>Cargando...</div>;
  if (!user) return null;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>COVAI - Admin Dashboard</h1>
      <p>Bienvenido, {user.email}</p>
      <button 
        onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
        style={{ padding: '10px 20px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
      >
        Logout
      </button>
    </div>
  );
}
