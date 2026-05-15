import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { mockReservations, mockConversations, getSevenDaysMetrics } from '@/lib/mockData';

export default function Dashboard({ restaurantId, restaurantSlug, restaurantName }) {
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [sevenDaysData, setSevenDaysData] = useState([]);
  const [kpis, setKpis] = useState({ today: 0, week: 0, month: 0, offHours: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [today] = useState(new Date());
  const [hoveredRes, setHoveredRes] = useState(null);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000);
    return () => clearInterval(interval);
  }, [restaurantSlug, restaurantId]);

  const loadAllData = async () => {
    setError(null);
    try {
      const todayStr = formatDate(today);
      let useMock = false;
      
      // Intentar cargar de Supabase
      const { data: todayRes, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', todayStr)
        .order('hora', { ascending: true });

      if (resError || !todayRes || todayRes.length === 0) {
        // Fallback a mock data
        setReservations(mockReservations);
        setConversations(mockConversations);
        setSevenDaysData(getSevenDaysMetrics());
        calculateKPIs(mockReservations, getSevenDaysMetrics());
        setUsingMock(true);
        setLoading(false);
        return;
      }

      setReservations(todayRes || []);

      let convData = [];
      try {
        const { data: convRes, error: convError } = await supabase
          .from('conversations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(15);
        
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
          day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
          count: count || 0,
          dayNum: d.getDate(),
        });
      }
      setSevenDaysData(sevenDays);

      calculateKPIs(todayRes || [], sevenDays);
      setUsingMock(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError('Error al cargar datos');
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

  const getStatusStyle = (status) => {
    const s = status?.toLowerCase().trim() || '';
    if (s === 'confirmada') return { bg: '#f0fdf4', color: '#16a34a', label: '✓ Confirmada' };
    if (s === 'cancelada') return { bg: '#fef2f2', color: '#dc2626', label: '✗ Cancelada' };
    if (s === 'pendiente') return { bg: '#fef3c7', color: '#ca8a04', label: '⏱ Pendiente' };
    return { bg: '#f3f4f6', color: '#6b7280', label: status };
  };

  if (loading) return <div style={styles.loader}>Cargando panel...</div>;

  if (error) return (
    <div style={styles.errorBox}>
      <p>{error}</p>
      <button onClick={() => { setLoading(true); loadAllData(); }} style={styles.retryBtn}>Reintentar</button>
    </div>
  );

  return (
    <div style={styles.root}>
      {/* HEADER */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>👋 Buenas tardes, {restaurantName}</h1>
          <p style={styles.date}>{today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          {usingMock && <p style={styles.mockBadge}>📊 Datos de demostración</p>}
        </div>
        <div style={styles.headerActions}>
          <button style={styles.btnHeader}>📊 Resumen mensual</button>
          <button style={styles.btnHeader}>🔔</button>
        </div>
      </header>

      {/* CARRUSEL 7 DÍAS */}
      <div style={styles.carousel}>
        {sevenDaysData.map((d, i) => (
          <div key={i} style={{
            ...styles.carouselItem,
            ...(i === 6 && styles.carouselItemActive)
          }}>
            <p style={styles.carouselDay}>{d.day}</p>
            <p style={styles.carouselNum}>{d.dayNum}</p>
            <p style={styles.carouselCount}>{d.count}</p>
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div style={styles.kpis}>
        <div style={styles.kpi}>
          <p style={styles.kpiIcon}>📅</p>
          <p style={styles.kpiNum}>{kpis.today}</p>
          <p style={styles.kpiLabel}>Reservas hoy</p>
        </div>
        <div style={styles.kpi}>
          <p style={styles.kpiIcon}>👥</p>
          <p style={styles.kpiNum}>{kpis.week}</p>
          <p style={styles.kpiLabel}>Reservas esta semana</p>
        </div>
        <div style={styles.kpi}>
          <p style={styles.kpiIcon}>📊</p>
          <p style={styles.kpiNum}>{kpis.month}</p>
          <p style={styles.kpiLabel}>Reservas este mes</p>
        </div>
        <div style={styles.kpi}>
          <p style={styles.kpiIcon}>🌙</p>
          <p style={styles.kpiNum}>{kpis.offHours}</p>
          <p style={styles.kpiLabel}>Fuera de horario</p>
        </div>
      </div>

      {/* MAIN: Reservas + Chat */}
      <div style={styles.main}>
        {/* RESERVAS */}
        <section style={styles.reservas}>
          <h2 style={styles.sectionTitle}>Reservas de hoy</h2>
          <div style={styles.reservasList}>
            {reservations.length === 0 ? (
              <p style={styles.empty}>Sin reservas</p>
            ) : (
              reservations.map(r => {
                const st = getStatusStyle(r.status);
                return (
                  <div 
                    key={r.id} 
                    style={{
                      ...styles.reservaItem,
                      ...(hoveredRes === r.id && styles.reservaItemHover)
                    }}
                    onMouseEnter={() => setHoveredRes(r.id)}
                    onMouseLeave={() => setHoveredRes(null)}
                  >
                    <div style={styles.reservaLeft}>
                      <p style={styles.reservaTime}>{r.hora}</p>
                      <div style={styles.reservaInfo}>
                        <p style={styles.reservaName}>{r.nombre}</p>
                        <p style={styles.reservaPhone}>{r.telefono}</p>
                      </div>
                    </div>
                    <div style={styles.reservaRight}>
                      <span style={styles.reservaPeople}>👥 {r.personas}</span>
                      <span style={{
                        ...styles.reservaStatus,
                        background: st.bg,
                        color: st.color
                      }}>
                        {st.label}
                      </span>
                      <button style={styles.whatsappBtn}>💬</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* CHAT */}
        <section style={styles.chat}>
          <h2 style={styles.sectionTitle}>Conversación activa</h2>
          <div style={styles.messages}>
            {conversations.length === 0 ? (
              <p style={styles.empty}>Sin mensajes</p>
            ) : (
              conversations.map(msg => (
                <div key={msg.id} style={styles.msgBubble}>
                  <div style={styles.msgAvatar}>👤</div>
                  <div style={styles.msgContent}>
                    <p style={styles.msgName}>{msg.guest_name || msg.guest_phone}</p>
                    <p style={styles.msgText}>{msg.message_text}</p>
                    <p style={styles.msgTime}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={styles.inputBox}>
            <input type="text" placeholder="Escribe un mensaje..." style={styles.input} disabled />
            <button style={styles.sendBtn}>➤</button>
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#fafaf7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '28px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e5e5e0',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    color: '#111',
  },
  date: {
    fontSize: '13px',
    color: '#888',
    margin: '0 0 4px 0',
  },
  mockBadge: {
    fontSize: '11px',
    color: '#22c55e',
    margin: 0,
    fontWeight: '600',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
  },
  btnHeader: {
    padding: '8px 14px',
    background: '#fff',
    border: '1px solid #e5e5e0',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  carousel: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    overflowX: 'auto',
    paddingBottom: '8px',
  },
  carouselItem: {
    minWidth: '90px',
    padding: '12px 10px',
    background: '#fff',
    border: '1px solid #e5e5e0',
    borderRadius: '6px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 150ms',
  },
  carouselItemActive: {
    background: '#f0fdf4',
    borderColor: '#22c55e',
    borderWidth: '2px',
  },
  carouselDay: {
    fontSize: '11px',
    color: '#888',
    margin: '0 0 4px 0',
    fontWeight: '500',
  },
  carouselNum: {
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
  kpis: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '14px',
    marginBottom: '24px',
  },
  kpi: {
    padding: '16px',
    background: '#fff',
    borderRadius: '6px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    textAlign: 'center',
  },
  kpiIcon: {
    fontSize: '24px',
    margin: '0 0 8px 0',
  },
  kpiNum: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#22c55e',
    margin: '0 0 4px 0',
  },
  kpiLabel: {
    fontSize: '11px',
    color: '#888',
    margin: 0,
    fontWeight: '500',
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '62% 1fr',
    gap: '18px',
  },
  reservas: {
    background: '#fff',
    borderRadius: '8px',
    padding: '18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  chat: {
    background: '#fff',
    borderRadius: '8px',
    padding: '18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 14px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  reservasList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '580px',
    overflowY: 'auto',
  },
  reservaItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: '#f9f9f7',
    borderLeft: '3px solid #22c55e',
    borderRadius: '4px',
    transition: 'all 120ms',
    cursor: 'pointer',
  },
  reservaItemHover: {
    background: '#f3f8f6',
    boxShadow: '0 2px 6px rgba(34, 197, 94, 0.12)',
  },
  reservaLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    flex: 1,
  },
  reservaTime: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#22c55e',
    margin: 0,
    minWidth: '50px',
  },
  reservaInfo: {
    flex: 1,
  },
  reservaName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#111',
    margin: '0 0 2px 0',
  },
  reservaPhone: {
    fontSize: '10px',
    color: '#888',
    margin: 0,
  },
  reservaRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  reservaPeople: {
    fontSize: '10px',
    color: '#666',
    fontWeight: '500',
  },
  reservaStatus: {
    fontSize: '9px',
    fontWeight: '600',
    padding: '3px 6px',
    borderRadius: '3px',
  },
  whatsappBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px',
    opacity: 0.7,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '10px',
    maxHeight: '500px',
  },
  msgBubble: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  },
  msgAvatar: {
    fontSize: '20px',
    minWidth: '32px',
    textAlign: 'center',
  },
  msgContent: {
    background: '#f0fdf4',
    border: '1px solid #dbeafe',
    borderLeft: '3px solid #22c55e',
    borderRadius: '6px',
    padding: '8px 10px',
    maxWidth: '280px',
  },
  msgName: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#16a34a',
    margin: '0 0 2px 0',
  },
  msgText: {
    fontSize: '12px',
    color: '#1a1a1a',
    margin: '2px 0',
    lineHeight: '1.35',
    wordBreak: 'break-word',
  },
  msgTime: {
    fontSize: '9px',
    color: '#999',
    margin: '3px 0 0 0',
  },
  inputBox: {
    display: 'flex',
    gap: '6px',
  },
  input: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid #e5e5e0',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  sendBtn: {
    padding: '8px 10px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0.5,
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#ccc',
    fontSize: '12px',
  },
  loader: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
  },
  errorBox: {
    padding: '40px',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: '12px',
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
