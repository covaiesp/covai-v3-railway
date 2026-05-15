import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';
import Dashboard from '@/components/Dashboard';

export default function RestaurantDashboard() {
  const router = useRouter();
  const { restaurant } = router.query;
  const [restaurantData, setRestaurantData] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;

    const checkAccess = async () => {
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('id, name, slug')
          .eq('slug', restaurant)
          .single();

        if (error || !data) {
          router.push('/');
          return;
        }

        setRestaurantData(data);
        setAuthorized(true);
      } catch (err) {
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [restaurant, router]);

  const handleLogout = () => {
    router.push('/');
  };

  if (loading) return <div style={{ padding: '20px' }}>Cargando...</div>;
  if (!authorized || !restaurantData) return null;

  return (
    <div>
      <Dashboard 
        restaurantId={restaurantData.id}
        restaurantSlug={restaurantData.slug}
        restaurantName={restaurantData.name}
      />
      <div style={styles.footer}>
        <button onClick={handleLogout} style={styles.btnLogout}>
          Salir
        </button>
      </div>
    </div>
  );
}

const styles = {
  footer: {
    padding: '20px',
    textAlign: 'center',
    background: '#fff',
    borderTop: '1px solid #e8e8e3',
  },
  btnLogout: {
    padding: '10px 20px',
    background: '#f5f5f0',
    color: '#111',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
