import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function Dashboard({ restaurantId, restaurantSlug, restaurantName }) {
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [sevenDaysData, setSevenDaysData] = useState([]);
  const [kpis, setKpis] = useState({ today: 0, week: 0, month: 0, offHours: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [today] = useState(new Date());

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000);
    return () => clearInterval(interval);
  }, [restaurantSlug, restaurantId]);

  const loadAllData = async () => {
    setError(null);
    try {
      const todayStr = formatDate(today);
      
      // 1. CARGAR RESERVAS DE HOY
      const { data: todayRes, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', todayStr)
        .order('hora', { ascending: true });

      if (resError) throw resError;
      setReservations(todayRes || []);

      // 2. CARGAR CONVERSACIONES (CON FILTRO MULTI-TENANT SEGURO)
      let convData = [];
      try {
        const { data: convRes, error: convError } = await supabase
          .from('conversations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (!convError) {
          convData = convRes || [];
        }
      } catch (convErr) {
        console.warn('Conversations no disponibles:', convErr);
      }
      setConversations(convData);

      // 3. CARGAR DATA 7 DÍAS
      const sevenDays = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = formatDate(d);
        
        const { data: dayRes, count } = await supabase
          .from('reservations')
          .select('*', { count: 'exact' })
          .eq('restaurant_slug', restaurantSlug)
          .eq('fecha', dateStr);

        sevenDays.push({
          date: dateStr,
          day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
          count: count || 0,
          dayNum: d.getDate(),
        });
      }
      setSevenDaysData(sevenDays);

      // 4. CALCULAR KPIs
      calculateKPIs(todayRes || [], sevenDays);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError('Error al cargar datos. Intenta recargar.');
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = (todayData, sevenDays) => {
    const todayCount = todayData.length;
    const weekCount = sevenDays.reduce((sum, d) => sum + d.count, 0);
    
    let offHoursCount = 0;
    todayData.forEach(r => {
      if (r.hora) {
        try {
          const hour = parseInt(r.hora.split(':')[0], 10);
          if (!isNaN(hour) && (hour < 12 || hour > 22)) {
            offHoursCount++;
          }
        } catch (e) {
          // Ignorar errores de parsing
        }
      }
    });

    setKpis({
      today: todayCount,
      week: weekCount,
      month: Math.round(weekCount * 4.3),
      offHours: offHoursCount,
    });
  };

  const formatDate = (d) => d.toISOString().split('T')[0];

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase().trim() || '';
    
    if (statusLower === 'confirmada') return styles.statusConfirmed;
    if (statusLower === 'cancelada') return styles.statusCancelled;
    if (statusLower === 'pendiente') return styles.statusPending;
    
    return styles.statusDefault;
  };

  const getStatusLabel = (status) => {
    return status?.charAt(0).toUpperCase() + status?.slice(1) || 'Sin estado';
  };

  if (loading) {
    return <div style={styles.loading}>Cargando dashboard...</div>;
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>{error}</p>
        <button 
          onClick={() => {
            setLoading(true);
            loadAllData();
          }}
          style={styles.retryBtn}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>COVAI</h1>
          <div>
            <h2 style={styles.restaurantName}>Bienvenido, {restaurantName}</h2>
            <p style={styles.headerDate}>
              {today.toLocaleDateString('es-ES', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.btnSummary}>📊 Resumen Mensual</button>
          <div style={styles.notificationBell}>🔔</div>
        </div>
      </header>

      {/* CARRUSEL 7 DÍAS */}
      <section style={styles.carouselSection}>
        <div style={styles.carousel}>
          {sevenDaysData.map((dayData, idx) => (
            <div
              key={idx}
              style={{
                ...styles.carouselCard,
                ...(idx === sevenDaysData.length - 1 ? styles.carouselCardActive : {}),
              }}
            >
              <p style={styles.carouselDay}>{dayData.day}</p>
              <p style={styles.carouselDate}>{dayData.dayNum}</p>
              <p style={styles.carouselCount}>{dayData.count}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section style={styles.kpisSection}>
        <div style={styles.kpiCard}>
          <p style={styles.kpiLabel}>Hoy</p>
          <p style={styles.kpiValue}>{kpis.today}</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiLabel}>Esta Semana</p>
          <p style={styles.kpiValue}>{kpis.week}</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiLabel}>Este Mes</p>
          <p style={styles.kpiValue}>{kpis.month}</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiLabel}>Fuera Horario</p>
          <p style={styles.kpiValue}>{kpis.offHours}</p>
        </div>
      </section>

      {/* MAIN: Reservas + Chat */}
      <div style={styles.mainGrid}>
        {/* IZQUIERDA: RESERVAS */}
        <section style={styles.reservationsPanel}>
          <h2 style={styles.panelTitle}>Reservas de Hoy</h2>
          <div style={styles.reservationsList}>
            {reservations.length === 0 ? (
              <p style={styles.emptyState}>Sin reservas para hoy</p>
            ) : (
              reservations.map((res) => (
                <div key={res.id} style={styles.reservationItem}>
                  <div style={styles.resItemTop}>
                    <div>
                      <p style={styles.resName}>{res.nombre || 'Sin nombre'}</p>
                      <p style={styles.resPhone}>📱 {res.telefono || 'Sin teléfono'}</p>
                    </div>
                    <span style={styles.resTime}>{res.hora || '--:--'}</span>
                  </div>
                  <div style={styles.resItemBottom}>
                    <span style={styles.resPeople}>👥 {res.personas || 0} personas</span>
                    <span style={{
                      ...styles.resStatus,
                      ...getStatusColor(res.status),
                    }}>
                      {getStatusLabel(res.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* DERECHA: CONVERSACIONES */}
        <section style={styles.chatPanel}>
          <h2 style={styles.panelTitle}>Últimos Mensajes</h2>
          <div style={styles.chatMessages}>
            {conversations.length === 0 ? (
              <p style={styles.emptyState}>Sin mensajes</p>
            ) : (
              conversations.map((msg) => (
                <div key={msg.id} style={styles.chatBubble}>
                  <p style={styles.chatSender}>{msg.guest_name || msg.guest_phone || 'Cliente'}</p>
                  <p style={styles.chatMessage}>{msg.message_text || ''}</p>
                  <p style={styles.chatTimeStamp}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) : 'Sin hora'}
                  </p>
                </div>
              ))
            )}
          </div>
          <input
            type="text"
            placeholder="Responder..."
            style={styles.chatInput}
            disabled
          />
        </section>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#fafaf8',
    fontFamily: 'Inter, -apple-system, sans-serif',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e8e8e3',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  logo: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
  },
  restaurantName: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 4px 0',
  },
  headerDate: {
    fontSize: '13px',
    color: '#777',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  btnSummary: {
    padding: '10px 16px',
    background: '#fff',
    color: '#111',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  notificationBell: {
    fontSize: '24px',
    cursor: 'pointer',
  },
  carouselSection: {
    marginBottom: '32px',
    overflowX: 'auto',
    paddingBottom: '12px',
  },
  carousel: {
    display: 'flex',
    gap: '12px',
    minWidth: 'min-content',
  },
  carouselCard: {
    padding: '16px 12px',
    background: '#fff',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    textAlign: 'center',
    minWidth: '100px',
    cursor: 'pointer',
  },
  carouselCardActive: {
    background: '#f0fdf4',
    borderColor: '#22c55e',
    borderWidth: '2px',
  },
  carouselDay: {
    fontSize: '12px',
    color: '#777',
    margin: '0 0 4px 0',
    fontWeight: '500',
  },
  carouselDate: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 4px 0',
  },
  carouselCount: {
    fontSize: '11px',
    color: '#22c55e',
    margin: 0,
    fontWeight: '600',
  },
  kpisSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '32px',
  },
  kpiCard: {
    padding: '20px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    textAlign: 'center',
  },
  kpiLabel: {
    fontSize: '12px',
    color: '#777',
    margin: '0 0 8px 0',
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#22c55e',
    margin: 0,
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '65% 1fr',
    gap: '20px',
  },
  reservationsPanel: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  chatPanel: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 16px 0',
  },
  reservationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '600px',
    overflowY: 'auto',
  },
  reservationItem: {
    padding: '16px',
    background: '#f9f9f7',
    borderLeft: '4px solid #22c55e',
    borderRadius: '8px',
  },
  resItemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  resName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111',
    margin: 0,
  },
  resPhone: {
    fontSize: '12px',
    color: '#666',
    margin: '4px 0 0 0',
  },
  resTime: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#22c55e',
  },
  resItemBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resPeople: {
    fontSize: '12px',
    color: '#666',
  },
  resStatus: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  statusConfirmed: {
    background: '#f0fdf4',
    color: '#16a34a',
  },
  statusPending: {
    background: '#fef3c7',
    color: '#ca8a04',
  },
  statusCancelled: {
    background: '#fef2f2',
    color: '#dc2626',
  },
  statusDefault: {
    background: '#f3f4f6',
    color: '#6b7280',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '500px',
  },
  chatBubble: {
    padding: '12px 14px',
    background: '#f0fdf4',
    borderRadius: '8px',
    borderLeft: '4px solid #22c55e',
  },
  chatSender: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 4px 0',
  },
  chatMessage: {
    fontSize: '13px',
    color: '#333',
    margin: '4px 0',
    lineHeight: '1.4',
    wordBreak: 'break-word',
  },
  chatTimeStamp: {
    fontSize: '11px',
    color: '#999',
    margin: '4px 0 0 0',
  },
  chatInput: {
    padding: '10px 12px',
    border: '1px solid #e8e8e3',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#999',
    fontSize: '14px',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '16px',
    color: '#777',
  },
  errorContainer: {
    padding: '40px',
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '14px',
    marginBottom: '16px',
  },
  retryBtn: {
    padding: '10px 16px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
