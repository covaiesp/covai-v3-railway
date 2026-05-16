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
  const [selectedThread, setSelectedThread] = useState(null);
  const [readThreads, setReadThreads] = useState(new Set());
  const [handoffPhones, setHandoffPhones] = useState(new Set());
  const [resolvedHandoffs, setResolvedHandoffs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('covai_resolved_handoffs') || '[]')); }
    catch { return new Set(); }
  });
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    loadAllData();
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

      if (resError) throw new Error(resError.message);
      setReservations(todayRes || []);

      const { data: convRes } = await supabase
        .from('conversations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(50);
      setConversations(convRes || []);

      // Cargar teléfonos en estado fallback_human (requieren atención humana)
      const { data: handoffRes } = await supabase
        .from('conversation_states')
        .select('phone_number')
        .eq('restaurant_id', restaurantId)
        .eq('state', 'fallback_human');
      setHandoffPhones(new Set((handoffRes || []).map(r => r.phone_number)));

      const sevenDays = [];
      for (let i = 0; i <= 6; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
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

      // Mes actual — conteo real de reservas (no estimación)
      const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const { count: monthCount } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_slug', restaurantSlug)
        .gte('fecha', startOfMonth)
        .lte('fecha', todayStr);

      calculateKPIs(todayRes || [], sevenDays, monthCount || 0);
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = (todayData, sevenDays, monthCount) => {
    const todayCount = todayData.length;
    const weekCount = sevenDays.reduce((sum, d) => sum + d.count, 0);
    
    let offHoursCount = 0;
    todayData.forEach(r => {
      if (r.hora) {
        try {
          const hour = parseInt(r.hora.split(':')[0], 10);
          if (!isNaN(hour) && (hour < 12 || hour > 22)) offHoursCount++;
        } catch (e) {}
      }
    });

    setKpis({
      today: todayCount,
      week: weekCount,
      month: monthCount,
      offHours: offHoursCount,
    });
  };

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getStatusStyle = (status) => {
    const s = status?.toLowerCase().trim() || '';
    if (s === 'confirmada') return { bg: '#e8f5e9', color: '#2e7d32', label: 'Confirmada' };
    if (s === 'cancelada') return { bg: '#ffebee', color: '#c62828', label: 'Cancelada' };
    if (s === 'pendiente') return { bg: '#fff3e0', color: '#e65100', label: 'Pendiente' };
    return { bg: '#f5f5f5', color: '#616161', label: status };
  };

  const getDir = (msg) => msg.message_direction || msg.direction || (msg.guest_name === 'Sistema' ? 'out' : 'in');

  const formatMsgTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso), diff = Date.now() - d;
    if (diff < 60000) return 'ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  if (loading) return <div style={s.loader}>Cargando panel...</div>;
  if (error) return <div style={s.error}>{error}</div>;

  const threads = (() => {
    const map = {};
    conversations.forEach(msg => {
      const key = msg.guest_phone;
      if (!map[key]) map[key] = { phone: key, name: '', messages: [] };
      if (!map[key].name && msg.guest_name && msg.guest_name !== 'Sistema') map[key].name = msg.guest_name;
      map[key].messages.push(msg);
    });
    return Object.values(map)
      .map(t => {
        const sorted = [...t.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const lastMsg = sorted[sorted.length - 1];
        const lastOutIdx = sorted.reduce((idx, m, i) => getDir(m) === 'out' ? i : idx, -1);
        const unread = sorted.slice(lastOutIdx + 1).filter(m => getDir(m) === 'in').length;
        return { ...t, name: t.name || t.phone, messages: sorted, lastMsg, unread };
      })
      .sort((a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
  })();

  const activePhone = selectedThread || threads[0]?.phone;
  const activeThread = threads.find(t => t.phone === activePhone) || null;
  const totalUnread = threads.reduce((sum, t) => {
    if (t.phone === activePhone || readThreads.has(t.phone)) return sum;
    return sum + t.unread;
  }, 0);

  const handleSelectThread = (phone) => {
    setSelectedThread(phone);
    setReadThreads(prev => new Set([...prev, phone]));
    // Marcar handoff como atendido localmente
    if (handoffPhones.has(phone)) {
      setResolvedHandoffs(prev => {
        const next = new Set([...prev, phone]);
        try { localStorage.setItem('covai_resolved_handoffs', JSON.stringify([...next])); } catch {}
        return next;
      });
    }
    setInputText('');
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !activePhone || sending) return;
    setSendError('');
    setInputText('');
    // Optimistic: mostrar el mensaje de inmediato
    const tempMsg = {
      id: `local-${Date.now()}`,
      guest_name: activeThread?.name || activePhone,
      guest_phone: activePhone,
      message_direction: 'out',
      message_text: text,
      created_at: new Date().toISOString(),
    };
    setConversations(prev => [...prev, tempMsg]);
    setSending(true);
    try {
      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          to_phone: activePhone,
          message_text: text,
          guest_name: activeThread?.name || activePhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) setSendError(data.error || 'Error al enviar');
    } catch {
      setSendError('Error de red');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={s.root}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerContent}>
          <h1 style={s.greeting}>Buenas tardes, {restaurantName}</h1>
          <p style={s.dateText}>{today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div style={s.logoWrap}>
          <span style={s.logoCo}>CO</span>
          <svg width="20" height="30" viewBox="0 0 16 24" fill="none" style={{display:'block',margin:'0 2px'}}>
            <polyline points="1,11 8,22 15,2" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={s.logoAi}>AI</span>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnHeader}>📊 Resumen mensual</button>
          <button onClick={loadAllData} style={s.btnRefresh} title="Actualizar datos">↻</button>
          <button style={s.btnNotif}>🔔</button>
        </div>
      </header>

      {/* CARRUSEL 7 DÍAS */}
      <div style={s.carouselContainer}>
        <button style={s.carouselArrow}>←</button>
        <div style={s.carousel}>
          {sevenDaysData.map((d, i) => (
            <div key={i} style={{...s.carouselCard, ...(i === 0 && s.carouselCardActive)}}>
              <p style={s.carouselDay}>{d.day}</p>
              <p style={s.carouselNum}>{d.dayNum}</p>
              <p style={s.carouselMonth}>{new Date(d.date).toLocaleString('es-ES', { month: 'short' })}</p>
              <p style={s.carouselCount}>{d.count} Reservas</p>
            </div>
          ))}
        </div>
        <button style={s.carouselArrow}>→</button>
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpiCard}>
          <p style={s.kpiIcon}>📅</p>
          <p style={s.kpiLabel}>Reservas hoy</p>
          <p style={s.kpiNum}>{kpis.today}</p>
        </div>
        <div style={s.kpiCard}>
          <p style={s.kpiIcon}>👥</p>
          <p style={s.kpiLabel}>Esta semana</p>
          <p style={s.kpiNum}>{kpis.week}</p>
        </div>
        <div style={s.kpiCard}>
          <p style={s.kpiIcon}>📊</p>
          <p style={s.kpiLabel}>Este mes (est.)</p>
          <p style={s.kpiNum}>{kpis.month}</p>
        </div>
        <div style={s.kpiCard}>
          <p style={s.kpiIcon}>⏰</p>
          <p style={s.kpiLabel}>Fuera de horario</p>
          <p style={s.kpiNum}>{kpis.offHours}</p>
        </div>
      </div>

      {/* MAIN: Reservas + Chat */}
      <div style={s.main}>
        {/* RESERVAS */}
        <section style={s.reservasSection}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>Reservas de hoy</h2>
            <a style={s.verTodas}>Ver todas</a>
          </div>
          <div style={s.reservasTable}>
            {reservations.length === 0 ? (
              <p style={s.empty}>Sin reservas</p>
            ) : (
              reservations.map(r => {
                const st = getStatusStyle(r.status);
                return (
                  <div key={r.id} style={{...s.reservaRow, ...(hoveredRes === r.id && s.reservaRowHover)}} onMouseEnter={() => setHoveredRes(r.id)} onMouseLeave={() => setHoveredRes(null)}>
                    <div style={s.reservaTime}>{r.hora}</div>
                    <div style={s.reservaInfo}>
                      <p style={s.reservaName}>{r.nombre}</p>
                      <p style={s.reservaPhone}>{r.telefono}</p>
                    </div>
                    <div style={s.reservaMiddle}>
                      <span style={s.reservaPeople}>👥 {r.personas}</span>
                      <span style={{...s.reservaBadge, background: st.bg, color: st.color}}>{st.label}</span>
                    </div>
                    <button style={s.whatsappIcon}>💬</button>
                  </div>
                );
              })
            )}
          </div>
          <p style={s.reservasCount}>{reservations.length} reservas</p>
        </section>

        {/* CHAT INBOX — WhatsApp Web layout */}
        <section style={s.chatSection}>

          {/* ── LEFT: Thread list ── */}
          <div style={s.chatLeft}>
            <div style={s.chatLeftHeader}>
              <h2 style={s.sectionTitle}>Mensajes</h2>
              {totalUnread > 0 && <span style={s.unreadBadge}>{totalUnread} sin leer</span>}
            </div>
            <div style={s.threadList}>
              {threads.length === 0 ? (
                <p style={s.emptyThreads}>Sin conversaciones</p>
              ) : threads.map(thread => {
                const isActive = thread.phone === activePhone;
                const hasUnread = thread.unread > 0 && !readThreads.has(thread.phone) && !isActive;
                const isHandoff = handoffPhones.has(thread.phone) && !resolvedHandoffs.has(thread.phone);
                const prefix = thread.lastMsg && getDir(thread.lastMsg) === 'out' ? 'Tú: ' : '';
                return (
                  <div key={thread.phone}
                       style={{...s.threadRow, ...(isActive && s.threadRowActive), ...(isHandoff && !isActive && s.threadRowHandoff)}}
                       onClick={() => handleSelectThread(thread.phone)}>
                    <div style={{...s.threadAvatar, ...(hasUnread && s.threadAvatarUnread), ...(isHandoff && !isActive && s.threadAvatarHandoff)}}>
                      {thread.name[0].toUpperCase()}
                    </div>
                    <div style={s.threadInfo}>
                      <div style={s.threadMeta}>
                        <span style={{...s.threadName, ...(hasUnread && s.threadNameUnread), ...(isHandoff && s.threadNameHandoff)}}>{thread.name}</span>
                        <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                          {isHandoff && !isActive && <span style={s.handoffBadge}>⚠</span>}
                          <span style={s.threadTime}>{formatMsgTime(thread.lastMsg?.created_at)}</span>
                        </div>
                      </div>
                      <div style={s.threadPreviewRow}>
                        <span style={{...s.threadPreview, ...(hasUnread && s.threadPreviewUnread), ...(isHandoff && s.threadPreviewHandoff)}}>
                          {prefix}{thread.lastMsg?.message_text}
                        </span>
                        {hasUnread && <span style={s.unreadDot}>{thread.unread}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── DIVIDER vertical ── */}
          <div style={s.chatVDivider} />

          {/* ── RIGHT: Active conversation ── */}
          <div style={s.chatRight}>
            {activeThread ? (
              <>
                <div style={s.activeChatHeader}>
                  <div style={s.activeChatAvatar}>{activeThread.name[0].toUpperCase()}</div>
                  <div style={s.activeChatInfo}>
                    <p style={s.activeChatName}>{activeThread.name}</p>
                    <p style={s.activeChatPhone}>{activeThread.phone}</p>
                  </div>
                  <div style={s.onlineDot} />
                </div>

                <div style={s.chatMessages}>
                  {activeThread.messages.map(msg => {
                    const dir = getDir(msg);
                    return (
                      <div key={msg.id} style={{...s.msgRow, ...(dir === 'out' && s.msgRowOut)}}>
                        {dir === 'in' && (
                          <div style={s.msgAvatar}>{activeThread.name[0].toUpperCase()}</div>
                        )}
                        <div style={{...s.msgBubble, ...(dir === 'out' && s.msgBubbleOut)}}>
                          <p style={s.msgText}>{msg.message_text}</p>
                          <div style={s.msgFooter}>
                            <span style={s.msgTime}>{formatMsgTime(msg.created_at)}</span>
                            {dir === 'out' && <span style={s.msgCheck}>✓✓</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sendError && <div style={s.sendError}>{sendError}</div>}
                <div style={s.inputArea}>
                  <input
                    type="text"
                    placeholder={sending ? 'Enviando...' : 'Escribe un mensaje...'}
                    style={s.input}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    disabled={sending}
                  />
                  <button style={{...s.sendBtn, opacity: sending ? 0.5 : 1}} onClick={handleSend} disabled={sending}>➤</button>
                </div>
              </>
            ) : (
              <div style={s.emptyConv}>
                <p style={{fontSize:'28px', margin:'0 0 8px'}}>💬</p>
                <p style={{fontSize:'13px', color:'#ccc'}}>Selecciona una conversación</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const s = {
  root: { minHeight: '100vh', background: '#f7f7f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '36px 52px 52px', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' },

  // ── Header ──────────────────────────────────────────────────────────────
  header: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: '36px' },
  headerContent: {},
  logoWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0px', userSelect: 'none' },
  logoCo: { fontSize: '22px', fontWeight: '800', color: '#111111', letterSpacing: '-0.5px', lineHeight: 1 },
  logoAi: { fontSize: '22px', fontWeight: '800', color: '#111111', letterSpacing: '-0.5px', lineHeight: 1 },
  greeting: { fontSize: '28px', fontWeight: '600', margin: '0 0 4px 0', color: '#111111', letterSpacing: '-0.5px' },
  dateText: { fontSize: '13px', color: '#aaa', margin: 0, fontWeight: '400' },
  mockBadge: { display: 'inline-block', fontSize: '11px', color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', margin: '8px 0 0 0', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' },
  headerRight: { display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end' },
  btnHeader: { padding: '9px 18px', background: '#fff', border: '1px solid #e8e8e8', borderRadius: '10px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: '#333', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  btnRefresh: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '10px', cursor: 'pointer', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', color: '#555' },
  btnNotif: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '10px', cursor: 'pointer', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },

  // ── Week carousel ────────────────────────────────────────────────────────
  carouselContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' },
  carouselArrow: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#888', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  carousel: { display: 'flex', gap: '8px', flex: 1, overflowX: 'auto' },
  carouselCard: { flex: '1 1 0', minWidth: '100px', padding: '16px 10px', background: '#fff', border: '1px solid #e8e8e8', borderRadius: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  carouselCardActive: { background: '#f0fdf4', borderColor: '#6ee7b7', boxShadow: '0 0 0 3px rgba(34,197,94,0.10), 0 1px 3px rgba(0,0,0,0.04)' },
  carouselDay: { fontSize: '10px', color: '#bbb', margin: '0 0 5px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px' },
  carouselNum: { fontSize: '24px', fontWeight: '700', color: '#111111', margin: '0 0 2px 0', letterSpacing: '-0.5px', lineHeight: 1 },
  carouselMonth: { fontSize: '10px', color: '#ccc', margin: '0 0 8px 0', fontWeight: '400' },
  carouselCount: { fontSize: '11px', color: '#888', margin: 0, fontWeight: '400' },

  // ── KPI cards ────────────────────────────────────────────────────────────
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' },
  kpiCard: { padding: '9px 14px', background: '#fff', border: '1px solid #e8e8e8', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  kpiIcon: { fontSize: '13px', margin: '0 0 4px 0', opacity: 0.7 },
  kpiLabel: { fontSize: '11px', color: '#999', margin: '0 0 2px 0', fontWeight: '500', lineHeight: 1.3 },
  kpiNum: { fontSize: '24px', fontWeight: '700', color: '#111111', margin: '0 0 2px 0', letterSpacing: '-1px', lineHeight: 1 },
  kpiSubtitle: { fontSize: '11px', color: '#22c55e', margin: 0, fontWeight: '500' },

  // ── Main two-column ──────────────────────────────────────────────────────
  main: { display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', alignItems: 'start' },

  reservasSection: { background: '#fff', borderRadius: '20px', padding: '28px', border: '1px solid #e8e8e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  chatSection: { background: '#fff', borderRadius: '20px', border: '1px solid #e8e8e8', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: '480px' },
  chatLeft: { width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0f0ee' },
  chatLeftHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 14px 12px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 },
  chatVDivider: { display: 'none' },
  chatRight: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '14px', fontWeight: '600', color: '#111111', margin: 0, letterSpacing: '-0.1px' },
  verTodas: { fontSize: '12px', color: '#22c55e', cursor: 'pointer', textDecoration: 'none', fontWeight: '500' },

  // ── Reservations list ────────────────────────────────────────────────────
  reservasTable: { marginBottom: '12px' },
  reservaRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 10px 12px 14px', borderLeft: '3px solid #22c55e', borderBottom: '1px solid #f5f5f5' },
  reservaRowHover: { background: '#fafaf8', borderRadius: '0 8px 8px 0' },
  reservaTime: { fontSize: '13px', fontWeight: '700', color: '#22c55e', minWidth: '44px' },
  reservaInfo: { flex: 1, minWidth: 0 },
  reservaName: { fontSize: '13px', fontWeight: '600', color: '#111111', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  reservaPhone: { fontSize: '11px', color: '#bbb', margin: 0 },
  reservaMiddle: { display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 },
  reservaPeople: { fontSize: '11px', color: '#999', whiteSpace: 'nowrap' },
  reservaBadge: { fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap' },
  whatsappIcon: { background: 'none', border: 'none', fontSize: '15px', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: 0.45 },
  reservasCount: { fontSize: '11px', color: '#ccc', margin: 0, paddingTop: '12px', fontWeight: '400' },

  // ── Thread list ──────────────────────────────────────────────────────────
  unreadBadge: { fontSize: '11px', fontWeight: '600', color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '20px' },
  threadList: { overflowY: 'auto', flex: 1 },
  emptyThreads: { textAlign: 'center', padding: '32px 12px', color: '#ddd', fontSize: '12px' },
  threadRow: { display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8f8f7' },
  threadRowActive: { background: '#f0fdf4' },
  threadAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#e8e8e8', color: '#666', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  threadAvatarUnread: { background: '#dcfce7', color: '#16a34a' },
  threadAvatarHandoff: { background: '#fee2e2', color: '#dc2626' },
  threadRowHandoff: { background: '#fff8f8', borderLeft: '3px solid #dc2626' },
  threadNameHandoff: { color: '#dc2626', fontWeight: '700' },
  threadPreviewHandoff: { color: '#dc2626' },
  handoffBadge: { fontSize: '10px', fontWeight: '700', color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' },
  threadInfo: { flex: 1, minWidth: 0 },
  threadMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' },
  threadName: { fontSize: '13px', fontWeight: '500', color: '#333', lineHeight: 1.2 },
  threadNameUnread: { fontWeight: '700', color: '#111111' },
  threadTime: { fontSize: '10px', color: '#bbb', flexShrink: 0, marginLeft: '6px' },
  threadPreviewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' },
  threadPreview: { fontSize: '12px', color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 },
  threadPreviewUnread: { color: '#555', fontWeight: '500' },
  unreadDot: { minWidth: '18px', height: '18px', background: '#22c55e', color: '#fff', borderRadius: '20px', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 4px' },

  // ── Active conversation ──────────────────────────────────────────────────
  chatDivider: { display: 'none' },
  activeChatHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#fafaf8', borderBottom: '1px solid #f0f0ee', flexShrink: 0 },
  activeChatAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activeChatInfo: { flex: 1, minWidth: 0 },
  activeChatName: { fontSize: '13px', fontWeight: '600', color: '#111111', margin: 0, lineHeight: 1.2 },
  activeChatPhone: { fontSize: '11px', color: '#aaa', margin: 0 },
  onlineDot: { width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 },

  chatMessages: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, padding: '14px 14px 8px', },
  msgRow: { display: 'flex', gap: '7px', alignItems: 'flex-end' },
  msgRowOut: { flexDirection: 'row-reverse' },
  msgAvatar: { width: '26px', height: '26px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgBubble: { background: '#f0fdf4', padding: '8px 11px 6px', borderRadius: '4px 13px 13px 13px', maxWidth: '84%', border: '1px solid #d1fae5' },
  msgBubbleOut: { background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: '13px 4px 13px 13px' },
  msgText: { fontSize: '12px', color: '#1a1a1a', margin: '0 0 4px 0', lineHeight: '1.45' },
  msgFooter: { display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'flex-end' },
  msgTime: { fontSize: '10px', color: '#bbb' },
  msgCheck: { fontSize: '10px', color: '#22c55e' },

  sendError: { fontSize: '11px', color: '#dc2626', padding: '4px 14px', background: '#fef2f2', borderTop: '1px solid #fecaca' },
  inputArea: { display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid #f0f0ee', flexShrink: 0 },
  input: { flex: 1, padding: '9px 13px', border: '1px solid #e8e8e8', borderRadius: '12px', fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: '#fafaf8', color: '#111' },
  sendBtn: { padding: '9px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', flexShrink: 0, fontWeight: '500' },
  emptyConv: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },

  empty: { textAlign: 'center', padding: '32px 20px', color: '#ddd', fontSize: '12px' },
  loader: { padding: '40px', textAlign: 'center', color: '#888', fontFamily: '-apple-system, sans-serif' },
  error: { padding: '40px', textAlign: 'center', color: '#dc2626' },
};
