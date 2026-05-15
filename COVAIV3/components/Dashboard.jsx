import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function Dashboard({ restaurantId, restaurantName }) {
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  const loadData = async () => {
    try {
      const [reservRes, convRes] = await Promise.all([
        supabase
          .from('reservations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('reservation_date', today)
          .order('reservation_time', { ascending: true }),
        supabase
          .from('conversations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setReservations(reservRes.data || []);
      setConversations(convRes.data || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>{restaurantName}</h1>
        <p style={styles.date}>{today}</p>
      </header>

      <div style={styles.grid}>
        <section style={styles.reservations}>
          <h2 style={styles.sectionTitle}>Reservas Hoy</h2>
          <div style={styles.list}>
            {reservations.length === 0 ? (
              <p style={styles.empty}>Sin reservas</p>
            ) : (
              reservations.map((res) => (
                <div key={res.id} style={styles.item}>
                  <div style={styles.itemHeader}>
                    <strong>{res.guest_name}</strong>
                    <span style={styles.time}>{res.reservation_time}</span>
                  </div>
                  <p style={styles.itemSubtitle}>{res.party_size} personas</p>
                  <p style={styles.itemPhone}>{res.guest_phone}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={styles.conversations}>
          <h2 style={styles.sectionTitle}>Mensajes</h2>
          <div style={styles.chatList}>
            {conversations.length === 0 ? (
              <p style={styles.empty}>Sin mensajes</p>
            ) : (
              conversations.map((msg) => (
                <div key={msg.id} style={styles.chatItem}>
                  <p style={styles.chatName}>{msg.guest_name || 'Anónimo'}</p>
                  <p style={styles.chatText}>{msg.message_text}</p>
                  <p style={styles.chatTime}>
                    {new Date(msg.created_at).toLocaleTimeString('es-ES')}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f9f9f7',
    fontFamily: 'Inter, sans-serif',
    padding: '20px',
  },
  header: {
    marginBottom: '30px',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 8px 0',
  },
  date: {
    fontSize: '14px',
    color: '#777',
    margin: 0,
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '16px',
    color: '#777',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  reservations: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  conversations: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 16px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  chatList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '500px',
    overflowY: 'auto',
  },
  item: {
    borderLeft: '4px solid #22c55e',
    padding: '12px',
    background: '#f9f9f7',
    borderRadius: '6px',
  },
  chatItem: {
    padding: '12px',
    background: '#f0fdf4',
    borderRadius: '8px',
    borderLeft: '4px solid #22c55e',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  time: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#22c55e',
  },
  itemSubtitle: {
    fontSize: '13px',
    color: '#555',
    margin: '4px 0',
  },
  itemPhone: {
    fontSize: '12px',
    color: '#777',
    margin: 0,
  },
  chatName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 4px 0',
  },
  chatText: {
    fontSize: '13px',
    color: '#333',
    margin: '4px 0',
    wordBreak: 'break-word',
  },
  chatTime: {
    fontSize: '11px',
    color: '#999',
    margin: '4px 0 0 0',
  },
  empty: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center',
    padding: '20px',
  },
};

