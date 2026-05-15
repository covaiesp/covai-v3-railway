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
  const [hoveredRes, setHoveredRes] = useState(null);

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000);
    return () => clearInterval(interval);
  }, [restaurantSlug, restaurantId]);

  const loadAllData = async () => {
    setError(null);
    try {
      const todayStr = formatDate(today);
      
      const { data: todayRes, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', todayStr)
        .order('hora', { ascending: true });

      if (resError) throw resError;
      setReservations(todayRes || []);

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
          day: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()],
          count: count || 0,
          dayNum: d.getDate(),
        });
      }
      setSevenDaysData(sevenDays);

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
        } catch (e) {}
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
    if (statusLower === 'confirmada') return { bg: '#f0fdf4', text: '#16a34a', label: 'Confirmada' };
    if (statusLower === 'cancelada') return { bg: '#fef2f2', text: '#dc2626', label: 'Cancelada' };
    if (statusLower === 'pendiente') return { bg: '#fef3c7', text: '#ca8a04', label: 'Pendiente' };
    return { bg: '#f3f4f6', text: '#6b7280', label: status || 'Sin estado' };
  };

  if (loading) {
    return <div style={styles.loading}>Cargando panel...</div>;
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
          <h1 style={styles.logo}>⭐ COVAI</h1>
          <div style={styles.headerMeta}>
            <h2 style={styles.restaurantName}>{restaurantName}</h2>
            <p style={styles.headerDate}>
              {today.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.btnSummary}>📊</button>
          <button style={styles.btnNotif}>🔔</button>
        </div>
      </header>

      {/* CARRUSEL */}
      <section style={styles.carouselSection}>
        <div style={styles.carousel}>
          {sevenDaysData.map((dayData, idx) => (
            <div
              key={idx}
              style={{
                ...styles.carouselCard,
                ...(idx === sevenDaysData.length - 1 && styles.carouselCardActive),
              }}
            >
              <p style={styles.carouselDay}>{dayData.day}</p>
              <p style={styles.carouselNum}>{dayData.dayNum}</p>
              <p style={styles.carouselCount}>{dayData.count}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section style={styles.kpisSection}>
        <div style={styles.kpiCard}>
          <p style={styles.kpiIcon}>📅</p>
          <p style={styles.kpiValue}>{kpis.today}</p>
          <p style={styles.kpiLabel}>Hoy</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiIcon}>📆</p>
          <p style={styles.kpiValue}>{kpis.week}</p>
          <p style={styles.kpiLabel}>Semana</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiIcon}>📊</p>
          <p style={styles.kpiValue}>{kpis.month}</p>
          <p style={styles.kpiLabel}>Mes</p>
        </div>
        <div style={styles.kpiCard}>
          <p style={styles.kpiIcon}>🌙</p>
          <p style={styles.kpiValue}>{kpis.offHours}</p>
          <p style={styles.kpiLabel}>Fuera horario</p>
        </div>
      </section>

      {/* MAIN CONTENT */}
      <div style={styles.mainGrid}>
        {/* RESERVAS */}
        <section style={styles.reservationsPanel}>
          <h3 style={styles.panelTitle}>Reservas Hoy</h3>
          <div style={styles.reservationsList}>
            {reservations.length === 0 ? (
              <p style={styles.emptyState}>Sin reservas para hoy</p>
            ) : (
              reservations.map((res) => {
                const statusInfo = getStatusColor(res.status);
                return (
                  <div 
                    key={res.id} 
                    style={{
                      ...styles.reservationItem,
                      ...(hoveredRes === res.id && styles.reservationItemHover),
                    }}
                    onMouseEnter={() => setHoveredRes(res.id)}
                    onMouseLeave={() => setHoveredRes(null)}
                  >
                    <div style={styles.resTop}>
                      <div style={styles.resInfo}>
                        <p style={styles.resName}>{res.nombre}</p>
                        <p style={styles.resPhone}>{res.telefono}</p>
                      </div>
                      <span style={styles.resTime}>{res.hora}</span>
                    </div>
                    <div style={styles.resBottom}>
                      <span style={styles.resPeople}>👥 {res.personas}</span>
                      <span style={{
                        ...styles.resBadge,
                        background: statusInfo.bg,
                        color: statusInfo.text,
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* CHAT */}
        <section style={styles.chatPanel}>
          <h3 style={styles.panelTitle}>Mensajes</h3>
          <div style={styles.chatMessages}>
            {conversations.length === 0 ? (
              <p style={styles.emptyState}>Sin mensajes</p>
            ) : (
              conversations.map((msg) => (
                <div key={msg.id} style={styles.messageBubble}>
                  <div style={styles.bubbleContent}>
                    <p style={styles.bubbleFrom}>{msg.guest_name || msg.guest_phone || 'Cliente'}</p>
                    <p style={styles.bubbleText}>{msg.message_text}</p>
                    <p style={styles.bubbleTime}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : ''}
                    </p>
                  </div>
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
    background: '#fafaf7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
    padding: '16px 20px 20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e5e0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  headerMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  restaurantName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: 0,
  },
  headerDate: {
    fontSize: '11px',
    color: '#888',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    gap: '8px',
  },
  btnSummary: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px',
    opacity: 0.7,
  },
  btnNotif: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px',
  },
  carouselSection: {
    marginBottom: '18px',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: '8px',
  },
  carousel: {
    display: 'flex',
    gap: '8px',
    minWidth: 'min-content',
  },
  carouselCard: {
    padding: '12px 10px',
    background: '#fff',
    border: '1px solid #e5e5e0',
    borderRadius: '6px',
    textAlign: 'center',
    minWidth: '70px',
    cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  carouselCardActive: {
    background: '#f0fdf4',
    borderColor: '#22c55e',
    borderWidth: '2px',
  },
  carouselDay: {
    fontSize: '10px',
    color: '#999',
    margin: '0 0 3px 0',
    fontWeight: '500',
  },
  carouselNum: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 3px 0',
  },
  carouselCount: {
    fontSize: '10px',
    color: '#22c55e',
    margin: 0,
    fontWeight: '600',
  },
  kpisSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  kpiCard: {
    padding: '14px',
    background: '#fff',
    borderRadius: '6px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    textAlign: 'center',
  },
  kpiIcon: {
    fontSize: '20px',
    margin: '0 0 6px 0',
  },
  kpiValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#22c55e',
    margin: '0 0 2px 0',
  },
  kpiLabel: {
    fontSize: '10px',
    color: '#888',
    margin: 0,
    fontWeight: '500',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '65% 1fr',
    gap: '16px',
  },
  reservationsPanel: {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  chatPanel: {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 12px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  reservationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '550px',
    overflowY: 'auto',
  },
  reservationItem: {
    padding: '12px',
    background: '#f9f9f7',
    borderLeft: '3px solid #22c55e',
    borderRadius: '4px',
    transition: 'all 150ms ease',
    cursor: 'pointer',
  },
  reservationItemHover: {
    background: '#f3f8f6',
    boxShadow: '0 2px 4px rgba(34, 197, 94, 0.1)',
  },
  resTop: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    alignItems: 'flex-start',
  },
  resInfo: {
    flex: 1,
  },
  resName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 2px 0',
  },
  resPhone: {
    fontSize: '11px',
    color: '#777',
    margin: 0,
  },
  resTime: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#22c55e',
    minWidth: '50px',
    textAlign: 'right',
  },
  resBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resPeople: {
    fontSize: '10px',
    color: '#666',
    fontWeight: '500',
  },
  resBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '3px 6px',
    borderRadius: '3px',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '500px',
  },
  messageBubble: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: '2px',
  },
  bubbleContent: {
    background: '#f0fdf4',
    border: '1px solid #dbeafe',
    borderLeft: '3px solid #22c55e',
    borderRadius: '6px',
    padding: '8px 10px',
    maxWidth: '85%',
  },
  bubbleFrom: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#16a34a',
    margin: '0 0 2px 0',
  },
  bubbleText: {
    fontSize: '12px',
    color: '#1a1a1a',
    margin: '2px 0',
    lineHeight: '1.3',
    wordBreak: 'break-word',
  },
  bubbleTime: {
    fontSize: '10px',
    color: '#999',
    margin: '3px 0 0 0',
  },
  chatInput: {
    padding: '8px 10px',
    border: '1px solid #e5e5e0',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    cursor: 'not-allowed',
    opacity: 0.5,
    background: '#f9f9f7',
  },
  emptyState: {
    textAlign: 'center',
    padding: '30px 15px',
    color: '#aaa',
    fontSize: '12px',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
  },
  errorContainer: {
    padding: '40px',
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '13px',
    marginBottom: '16px',
  },
  retryBtn: {
    padding: '8px 14px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
