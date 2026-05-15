import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';
import DashboardHTML from '@/components/DashboardHTML';
import ReservationModal from '@/components/ReservationModal';
import CancelReservationModal from '@/components/CancelReservationModal';

export default function RestaurantDashboard() {
  const router = useRouter();
  const { restaurant } = router.query;
  const [user, setUser] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!restaurant) return;

    const checkAccess = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        router.push('/login');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('role, restaurant_slug')
        .eq('id', authUser.id)
        .single();

      if (!userData) {
        router.push('/login');
        return;
      }

      // Allow admin to access all, or user to access their own
      if (userData.role === 'admin' || userData.restaurant_slug === restaurant) {
        setUser(authUser);
        setAuthorized(true);
      } else {
        router.push('/login');
      }
    };

    checkAccess();
  }, [restaurant, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleReservationCreated = () => {
    setShowNewModal(false);
    setRefreshTrigger(prev => prev + 1);
  };

  if (!authorized || !restaurant) {
    return <div style={{ padding: '20px' }}>Cargando...</div>;
  }

  return (
    <div>
      {/* Dashboard actual */}
      <DashboardHTML restaurant={restaurant} refreshTrigger={refreshTrigger} />

      {/* Botones de override */}
      <div style={styles.overrideBar}>
        <div style={styles.overrideContent}>
          <div style={styles.overrideButtons}>
            <button 
              onClick={() => setShowNewModal(true)}
              style={styles.btnNew}
            >
              ➕ Nueva Reserva
            </button>
            <button 
              onClick={() => setShowCancelModal(true)}
              style={styles.btnCancel}
            >
              ❌ Cancelar Reserva
            </button>
          </div>
          <button 
            onClick={handleLogout}
            style={styles.btnLogout}
          >
            Salir
          </button>
        </div>
      </div>

      {showNewModal && (
        <ReservationModal
          restaurant={restaurant}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleReservationCreated}
        />
      )}

      {showCancelModal && (
        <CancelReservationModal
          restaurant={restaurant}
          onClose={() => setShowCancelModal(false)}
          onSuccess={handleReservationCreated}
        />
      )}
    </div>
  );
}

const styles = {
  overrideBar: {
    background: '#fff',
    borderTop: '1px solid #e8e8e3',
    padding: '16px 32px',
    position: 'sticky',
    bottom: 0,
    zIndex: 50,
  },
  overrideContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  overrideButtons: {
    display: 'flex',
    gap: '12px',
  },
  btnNew: {
    padding: '10px 16px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  btnCancel: {
    padding: '10px 16px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  btnLogout: {
    padding: '10px 16px',
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
