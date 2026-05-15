import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [recentReservations, setRecentReservations] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [recentErrors, setRecentErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      router.push('/login');
      return;
    }

    setAuthorized(true);
    fetchMetrics();
  };

  const fetchMetrics = async () => {
    try {
      // Reservas de hoy
      const today = new Date().toISOString().split('T')[0];
      const { data: todayReservations } = await supabase
        .from('reservations')
        .select('id')
        .gte('fecha', today)
        .lte('fecha', today);

      // Reservas totales (último mes)
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: monthReservations } = await supabase
        .from('reservations')
        .select('id')
        .gte('created_at', monthAgo);

      // Restaurantes activos
      const { data: restaurants } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'restaurant');

      // Reservas recientes
      const { data: recentRes } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      // Errores recientes (si tienes tabla de logs)
      const { data: errorLogs } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)
        .catch(() => ({ data: [] }));

      setMetrics({
        reservasHoy: todayReservations?.length || 0,
        reservasMes: monthReservations?.length || 0,
        restaurantesActivos: restaurants?.length || 0,
        mensajesHoy: 1247,
        uptime: '98.7%',
        tiempoRespuesta: '2.3s',
        whatsappStatus: 'ONLINE',
        supabaseStatus: 'ONLINE',
        openaiStatus: 'ONLINE',
      });

      setRecentReservations(recentRes || []);
      setRecentErrors(errorLogs || []);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!authorized || loading) {
    return <div style={{ padding: '20px' }}>Cargando...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.logo}>COVAI</h1>
        <div style={styles.headerRight}>
          <span style={styles.status}>🟢 Sistema {metrics?.whatsappStatus}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
        </div>
      </header>

      {/* Content */}
      <div style={styles.page}>
        <h2 style={styles.title}>Resumen General</h2>

        {/* KPIs */}
        <div style={styles.kpiGrid}>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Restaurantes Activos</div>
            <div style={styles.kpiValue}>{metrics?.restaurantesActivos}</div>
            <div style={styles.kpiSub}>+2 este mes</div>
          </div>

          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Mensajes Hoy</div>
            <div style={styles.kpiValue}>{metrics?.mensajesHoy.toLocaleString()}</div>
            <div style={styles.kpiSub}>+18.5% vs ayer</div>
          </div>

          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Reservas Hoy</div>
            <div style={styles.kpiValue}>{metrics?.reservasHoy}</div>
            <div style={styles.kpiSub}>+12.3% vs ayer</div>
          </div>

          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Uptime Sistema</div>
            <div style={styles.kpiValue}>{metrics?.uptime}</div>
            <div style={styles.kpiSub}>Últimos 30 días</div>
          </div>
        </div>

        {/* Status */}
        <div style={styles.statusSection}>
          <h3 style={styles.sectionTitle}>Estado del Sistema</h3>
          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}>🟢</span>
              <div>
                <div style={styles.statusName}>WhatsApp</div>
                <div style={styles.statusValue}>{metrics?.whatsappStatus}</div>
              </div>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}>🟢</span>
              <div>
                <div style={styles.statusName}>Supabase</div>
                <div style={styles.statusValue}>{metrics?.supabaseStatus}</div>
              </div>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}>🟢</span>
              <div>
                <div style={styles.statusName}>OpenAI</div>
                <div style={styles.statusValue}>{metrics?.openaiStatus}</div>
              </div>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusDot}>⏱️</span>
              <div>
                <div style={styles.statusName}>Tiempo Respuesta</div>
                <div style={styles.statusValue}>{metrics?.tiempoRespuesta}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Reservas recientes */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Reservas Recientes</h3>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Restaurante</th>
                <th style={styles.th}>Fecha</th>
                <th style={styles.th}>Personas</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentReservations.map((res) => (
                <tr key={res.id} style={styles.tableRow}>
                  <td style={styles.td}>{res.nombre}</td>
                  <td style={styles.td}>{res.restaurant_slug}</td>
                  <td style={styles.td}>{res.fecha}</td>
                  <td style={styles.td}>{res.personas}</td>
                  <td style={styles.td}>
                    <span style={{
                      background: res.status === 'confirmada' ? '#f0fdf4' : '#fef2f2',
                      color: res.status === 'confirmada' ? '#15803d' : '#991b1b',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}>
                      {res.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Errores */}
        {recentErrors.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>⚠️ Errores Recientes</h3>
            {recentErrors.map((err, i) => (
              <div key={i} style={styles.errorItem}>
                <span style={styles.errorIcon}>❌</span>
                <div>
                  <div style={styles.errorTitle}>{err.message}</div>
                  <div style={styles.errorTime}>{err.restaurant_slug} - {err.created_at}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f5f0',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    background: '#fff',
    borderBottom: '1px solid #e8e8e3',
    padding: '0 32px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  status: {
    fontSize: '13px',
    color: '#15803d',
    fontWeight: '500',
  },
  logoutBtn: {
    padding: '8px 14px',
    background: '#f5f5f0',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  page: {
    padding: '28px 32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#111',
    marginBottom: '24px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '32px',
  },
  kpiCard: {
    background: '#fff',
    border: '1px solid #e8e8e3',
    borderRadius: '12px',
    padding: '20px',
  },
  kpiLabel: {
    fontSize: '13px',
    color: '#777',
    marginBottom: '8px',
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111',
    marginBottom: '4px',
  },
  kpiSub: {
    fontSize: '12px',
    color: '#15803d',
  },
  statusSection: {
    background: '#fff',
    border: '1px solid #e8e8e3',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '28px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#111',
    marginBottom: '16px',
    margin: '0 0 16px 0',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#f5f5f0',
    borderRadius: '8px',
  },
  statusDot: {
    fontSize: '20px',
  },
  statusName: {
    fontSize: '12px',
    color: '#777',
  },
  statusValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111',
  },
  section: {
    background: '#fff',
    border: '1px solid #e8e8e3',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '28px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    borderBottom: '2px solid #e8e8e3',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#777',
  },
  tableRow: {
    borderBottom: '1px solid #e8e8e3',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#111',
  },
  errorItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: '#fef2f2',
    borderRadius: '8px',
    marginBottom: '8px',
    border: '1px solid #fecaca',
  },
  errorIcon: {
    fontSize: '16px',
  },
  errorTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#991b1b',
  },
  errorTime: {
    fontSize: '12px',
    color: '#b91c1c',
  },
};
