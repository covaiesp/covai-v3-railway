import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

function formatDateStatic(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Dashboard({ restaurantId, restaurantSlug, restaurantName }) {
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [sevenDaysData, setSevenDaysData] = useState([]);
  const [kpis, setKpis] = useState({ today: 0, week: 0, month: 0, lastReservationMinutes: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // No guardamos 'today' en estado — se calcula en cada loadAllData para evitar
  // que el dashboard quede con fecha obsoleta si se deja abierto pasada la medianoche
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
  const [carouselStart, setCarouselStart] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => formatDateStatic(new Date()));
  const chatMessagesRef = useRef(null);
  const lastThreadRef = useRef(null);

  useEffect(() => {
    loadAllData();
    // Auto-refresh cada 30s para que las reservas confirmadas vía WhatsApp
    // aparezcan sin que el usuario tenga que recargar manualmente
    const interval = setInterval(loadAllData, 30_000);
    return () => clearInterval(interval);
  }, [restaurantSlug, restaurantId]);

  const handleSelectDate = async (dateStr) => {
    setSelectedDate(dateStr);
    // Fetch solo reservas de la fecha seleccionada — KPIs no cambian
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_slug', restaurantSlug)
      .eq('fecha', dateStr)
      .order('hora', { ascending: true });
    setReservations(data || []);
  };

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) return;
    const threadChanged = lastThreadRef.current !== selectedThread;
    lastThreadRef.current = selectedThread;
    if (threadChanged) {
      setTimeout(() => {
        if (chatMessagesRef.current) {
          chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
      }, 0);
    } else {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 120) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [conversations, selectedThread]);

  const loadAllData = async (dateOverride) => {
    setError(null);
    try {
      const todayStr = formatDate(new Date()); // para KPIs — siempre hoy
      const fetchDate = dateOverride || selectedDate; // para la tabla de reservas

      // Reservas para la fecha seleccionada (tabla principal)
      const { data: selectedRes, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', fetchDate)
        .order('hora', { ascending: true });

      if (resError) throw new Error(resError.message);
      setReservations(selectedRes || []);

      // Reservas de HOY — solo para KPIs, no se muestran en tabla
      const { data: todayRes } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', todayStr)
        .order('hora', { ascending: true });

      const convFetch = await fetch(`/api/conversations?restaurant_id=${restaurantId}`);
      const convRes = convFetch.ok ? await convFetch.json() : [];
      if (!convFetch.ok) console.error('conversations error:', await convFetch.text().catch(() => ''));
      setConversations(Array.isArray(convRes) ? convRes : []);

      const { data: handoffRes } = await supabase
        .from('conversation_states')
        .select('phone_number')
        .eq('restaurant_id', restaurantId)
        .eq('state', 'fallback_human');
      setHandoffPhones(new Set((handoffRes || []).map(r => r.phone_number)));

      const now = new Date();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysRemaining = lastDayOfMonth - now.getDate();
      const monthDays = [];
      for (let i = 0; i <= daysRemaining; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = formatDate(d);
        const { count } = await supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_slug', restaurantSlug)
          .eq('fecha', dateStr);
        monthDays.push({
          date: dateStr,
          day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
          count: count || 0,
          dayNum: d.getDate(),
          isToday: i === 0,
        });
      }
      setSevenDaysData(monthDays);

      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const { count: monthCount } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_slug', restaurantSlug)
        .gte('fecha', startOfMonth)
        .lte('fecha', todayStr);

      calculateKPIs(todayRes || [], monthDays, monthCount || 0);
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = (todayData, sevenDays, monthCount) => {
    const todayCount = todayData.length;
    const weekCount = sevenDays.reduce((sum, d) => sum + d.count, 0);

    // Minutos desde la última reserva de hoy
    let lastReservationMinutes = null;
    if (todayData.length > 0) {
      const lastCreated = todayData
        .map(r => r.created_at)
        .filter(Boolean)
        .sort()
        .reverse()[0];
      if (lastCreated) {
        lastReservationMinutes = Math.floor((Date.now() - new Date(lastCreated).getTime()) / 60000);
      }
    }

    setKpis({ today: todayCount, week: weekCount, month: monthCount, lastReservationMinutes });
  };

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getStatusStyle = (status) => {
    const st = status?.toLowerCase().trim() || '';
    if (st === 'confirmada') return { bg: '#EAF0EA', color: '#3A6340', label: 'Confirmada' };
    if (st === 'cancelada')  return { bg: '#F2ECEA', color: '#7A3830', label: 'Cancelada' };
    if (st === 'pendiente')  return { bg: '#F2EDE4', color: '#7A5E2C', label: 'Pendiente' };
    return { bg: '#EEEBE6', color: '#7A7060', label: status };
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

  const formatLastActivity = (minutes) => {
    if (minutes === null) return '—';
    if (minutes < 1) return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes} min`;
    const h = Math.floor(minutes / 60);
    return `Hace ${h}h`;
  };

  if (loading) return <div style={s.loader}>Cargando...</div>;
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
  const pendingHandoffs = [...handoffPhones].filter(p => !resolvedHandoffs.has(p)).length;

  const handleSelectThread = (phone) => {
    setSelectedThread(phone);
    setReadThreads(prev => new Set([...prev, phone]));
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

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.logoWrap}>
          <span style={s.logoCo}>CO</span>
          <svg width="14" height="22" viewBox="0 0 16 24" fill="none" style={{ display: 'block', margin: '0 1px' }}>
            <polyline points="1,11 8,22 15,2" stroke="#4ade80" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={s.logoAi}>AI</span>
        </div>

        <div style={s.headerCenter}>
          <h1 style={s.restaurantName}>{restaurantName}</h1>
          <div style={s.onlineRow}>
            <span style={s.onlineDotSmall} />
            <span style={s.onlineText}>Sistema activo</span>
          </div>
        </div>

        <div style={s.headerRight}>
          {pendingHandoffs > 0 && (
            <div style={s.handoffAlert}>
              <span style={s.handoffAlertDot} />
              <span style={s.handoffAlertText}>{pendingHandoffs} requiere{pendingHandoffs > 1 ? 'n' : ''} atención</span>
            </div>
          )}
          <button onClick={loadAllData} style={s.btnRefresh} title="Actualizar">↻</button>
        </div>
      </header>

      {/* ── TIMELINE ────────────────────────────────────────────────────── */}
      <div style={s.carouselContainer}>
        <button
          style={{ ...s.carouselArrow, opacity: carouselStart === 0 ? 0.25 : 0.7 }}
          onClick={() => setCarouselStart(Math.max(0, carouselStart - 1))}
          disabled={carouselStart === 0}
        >‹</button>
        <div style={s.carouselViewport}>
          <div style={{ ...s.carouselTrack, transform: `translateX(calc(-${carouselStart} * (100% / 7)))` }}>
            {sevenDaysData.map((d) => {
              const isSelected = d.date === selectedDate;
              return (
                <div
                  key={d.date}
                  onClick={() => handleSelectDate(d.date)}
                  style={{ ...s.carouselCard, ...(d.isToday && s.carouselCardToday), ...(isSelected && s.carouselCardSelected) }}
                >
                  <p style={{ ...s.carouselDay, ...(d.isToday && s.carouselDayToday), ...(isSelected && s.carouselDaySelected) }}>
                    {d.isToday ? 'Hoy' : d.day}
                  </p>
                  <p style={{ ...s.carouselNum, ...(isSelected && s.carouselNumSelected) }}>{d.dayNum}</p>
                  <p style={{ ...s.carouselCount, ...(d.count > 0 && s.carouselCountActive) }}>
                    {d.count > 0 ? d.count : '·'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <button
          style={{ ...s.carouselArrow, opacity: carouselStart + 7 >= sevenDaysData.length ? 0.25 : 0.7 }}
          onClick={() => setCarouselStart(Math.min(sevenDaysData.length - 7, carouselStart + 1))}
          disabled={carouselStart + 7 >= sevenDaysData.length}
        >›</button>
      </div>

      {/* ── STATUS STRIP ────────────────────────────────────────────────── */}
      <div style={s.statusStrip}>
        <div style={s.statusItem}>
          <span style={s.statusNum}>{kpis.today}</span>
          <span style={s.statusLabel}>reservas hoy</span>
        </div>
        <div style={s.statusDivider} />
        <div style={s.statusItem}>
          <span style={s.statusNum}>{kpis.week}</span>
          <span style={s.statusLabel}>próximos 7 días</span>
        </div>
        <div style={s.statusDivider} />
        <div style={s.statusItem}>
          <span style={s.statusNum}>{kpis.month}</span>
          <span style={s.statusLabel}>este mes</span>
        </div>
        <div style={s.statusDivider} />
        <div style={s.statusItem}>
          <span style={{ ...s.statusNum, fontSize: '14px', color: '#A09890' }}>
            {formatLastActivity(kpis.lastReservationMinutes)}
          </span>
          <span style={s.statusLabel}>última reserva</span>
        </div>
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <div style={s.main}>

        {/* RESERVAS */}
        <section style={s.reservasSection}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>
              {selectedDate === formatDate(new Date())
                ? 'Reservas de hoy'
                : `Reservas del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`}
            </h2>
            {reservations.length > 0 && (
              <span style={s.reservasCountBadge}>{reservations.length}</span>
            )}
          </div>

          {reservations.length === 0 ? (
            <div style={s.emptyState}>
              <p style={s.emptyStateText}>Sin reservas para hoy</p>
              <p style={s.emptyStateSubtext}>Las nuevas reservas aparecerán aquí automáticamente</p>
            </div>
          ) : (
            <div style={s.reservasTable}>
              {reservations.map(r => {
                const st = getStatusStyle(r.status);
                return (
                  <div
                    key={r.id}
                    style={{ ...s.reservaRow, ...(hoveredRes === r.id && s.reservaRowHover) }}
                    onMouseEnter={() => setHoveredRes(r.id)}
                    onMouseLeave={() => setHoveredRes(null)}
                  >
                    <div style={s.reservaTime}>{r.hora}</div>
                    <div style={s.reservaInfo}>
                      <p style={s.reservaName}>{r.nombre}</p>
                      <p style={s.reservaPhone}>{r.telefono}</p>
                    </div>
                    <div style={s.reservaMiddle}>
                      <span style={s.reservaPeople}>{r.personas} pers.</span>
                      <span style={{ ...s.reservaBadge, background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CONVERSACIONES */}
        <section style={s.chatSection}>

          {/* Thread list */}
          <div style={s.chatLeft}>
            <div style={s.chatLeftHeader}>
              <h2 style={s.chatSectionTitle}>WhatsApp</h2>
              {totalUnread > 0 && <span style={s.unreadBadge}>{totalUnread}</span>}
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
                  <div
                    key={thread.phone}
                    style={{ ...s.threadRow, ...(isActive && s.threadRowActive), ...(isHandoff && !isActive && s.threadRowHandoff) }}
                    onClick={() => handleSelectThread(thread.phone)}
                  >
                    <div style={{ ...s.threadAvatar, ...(hasUnread && s.threadAvatarUnread), ...(isHandoff && !isActive && s.threadAvatarHandoff) }}>
                      {thread.name[0].toUpperCase()}
                    </div>
                    <div style={s.threadInfo}>
                      <div style={s.threadMeta}>
                        <span style={{ ...s.threadName, ...(hasUnread && s.threadNameUnread), ...(isHandoff && s.threadNameHandoff) }}>
                          {thread.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isHandoff && !isActive && <span style={s.handoffDot} />}
                          <span style={s.threadTime}>{formatMsgTime(thread.lastMsg?.created_at)}</span>
                        </div>
                      </div>
                      <div style={s.threadPreviewRow}>
                        <span style={{ ...s.threadPreview, ...(hasUnread && s.threadPreviewUnread), ...(isHandoff && s.threadPreviewHandoff) }}>
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

          {/* Active conversation */}
          <div style={s.chatRight}>
            {activeThread ? (
              <>
                <div style={s.activeChatHeader}>
                  <div style={s.activeChatAvatar}>{activeThread.name[0].toUpperCase()}</div>
                  <div style={s.activeChatInfo}>
                    <p style={s.activeChatName}>{activeThread.name}</p>
                    <p style={s.activeChatPhone}>{activeThread.phone}</p>
                  </div>
                </div>

                <div ref={chatMessagesRef} style={s.chatMessages}>
                  {activeThread.messages.map(msg => {
                    const dir = getDir(msg);
                    return (
                      <div key={msg.id} style={{ ...s.msgRow, ...(dir === 'out' && s.msgRowOut) }}>
                        {dir === 'in' && (
                          <div style={s.msgAvatar}>{activeThread.name[0].toUpperCase()}</div>
                        )}
                        <div style={{ ...s.msgBubble, ...(dir === 'out' && s.msgBubbleOut) }}>
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
                    placeholder={sending ? 'Enviando…' : 'Escribe un mensaje…'}
                    style={s.input}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    disabled={sending}
                  />
                  <button
                    style={{ ...s.sendBtn, opacity: sending ? 0.4 : 1 }}
                    onClick={handleSend}
                    disabled={sending}
                  >›</button>
                </div>
              </>
            ) : (
              <div style={s.emptyConv}>
                <p style={s.emptyConvText}>Selecciona una conversación</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {

  root: {
    minHeight: '100vh',
    background: '#EFEDE8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    padding: '40px 52px 60px',
    maxWidth: '1440px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #E2DED7',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    flexShrink: 0,
  },
  logoCo: {
    fontSize: '19px',
    fontWeight: '800',
    color: '#1E1C1A',
    letterSpacing: '-0.5px',
    lineHeight: 1,
  },
  logoAi: {
    fontSize: '19px',
    fontWeight: '800',
    color: '#1E1C1A',
    letterSpacing: '-0.5px',
    lineHeight: 1,
  },
  headerCenter: {
    flex: 1,
    paddingLeft: '28px',
  },
  restaurantName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1E1C1A',
    margin: '0 0 4px 0',
    letterSpacing: '-0.2px',
    lineHeight: 1,
  },
  onlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  onlineDotSmall: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#4ade80',
    flexShrink: 0,
  },
  onlineText: {
    fontSize: '11px',
    color: '#B5AFA7',
    fontWeight: '400',
    letterSpacing: '0.1px',
  },
  headerRight: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexShrink: 0,
  },
  handoffAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '6px 12px',
    background: '#F8F0EE',
    border: '1px solid #E8D4D0',
    borderRadius: '20px',
  },
  handoffAlertDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#C06050',
    flexShrink: 0,
  },
  handoffAlertText: {
    fontSize: '12px',
    color: '#8A4030',
    fontWeight: '500',
  },
  btnRefresh: {
    background: 'transparent',
    border: '1px solid #E2DED7',
    borderRadius: '10px',
    cursor: 'pointer',
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    color: '#B5AFA7',
    lineHeight: 1,
  },

  // ── Carousel / Timeline ──────────────────────────────────────────────────────
  carouselContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
  },
  carouselArrow: {
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    fontSize: '22px',
    width: '28px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: '#B5AFA7',
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  carouselViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  carouselTrack: {
    display: 'flex',
    gap: '6px',
    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  carouselCard: {
    flexShrink: 0,
    width: 'calc((100% - 36px) / 7)',
    padding: '11px 6px',
    background: '#F5F3EF',
    border: '1px solid #E8E4DC',
    borderRadius: '12px',
    textAlign: 'center',
    boxSizing: 'border-box',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  carouselCardToday: {
    background: '#FAFAF8',
    border: '1px solid #C8E6CA',
    boxShadow: '0 0 0 3px rgba(74,222,128,0.10)',
  },
  carouselCardSelected: {
    background: '#2A4A30',
    border: '1px solid #1A3220',
    boxShadow: '0 2px 8px rgba(42,74,48,0.20)',
  },
  carouselDaySelected: {
    color: '#8FBF98',
  },
  carouselNumSelected: {
    color: '#FFFFFF',
  },
  carouselDay: {
    fontSize: '9px',
    color: '#C0BAB2',
    margin: '0 0 5px 0',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    lineHeight: 1,
  },
  carouselDayToday: {
    color: '#5A9060',
  },
  carouselNum: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#2A2825',
    margin: '0 0 5px 0',
    letterSpacing: '-0.5px',
    lineHeight: 1,
  },
  carouselNumToday: {
    color: '#1E1C1A',
  },
  carouselCount: {
    fontSize: '11px',
    color: '#C8C3BC',
    margin: 0,
    fontWeight: '400',
    lineHeight: 1,
  },
  carouselCountActive: {
    color: '#5A9060',
    fontWeight: '600',
  },

  // ── Status strip ─────────────────────────────────────────────────────────────
  statusStrip: {
    display: 'flex',
    alignItems: 'center',
    background: '#F5F3EF',
    border: '1px solid #E8E4DC',
    borderRadius: '14px',
    padding: '16px 28px',
    marginBottom: '18px',
    gap: '0',
  },
  statusItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
  },
  statusNum: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#1E1C1A',
    letterSpacing: '-1px',
    lineHeight: 1,
  },
  statusLabel: {
    fontSize: '11px',
    color: '#B5AFA7',
    fontWeight: '400',
    letterSpacing: '0.1px',
  },
  statusDivider: {
    width: '1px',
    height: '36px',
    background: '#E8E4DC',
    flexShrink: 0,
  },

  // ── Main two-column ──────────────────────────────────────────────────────────
  main: {
    display: 'grid',
    gridTemplateColumns: '3fr 2fr',
    gap: '14px',
    alignItems: 'start',
  },

  // ── Reservations ────────────────────────────────────────────────────────────
  reservasSection: {
    background: '#F8F6F2',
    borderRadius: '20px',
    padding: '28px 30px',
    border: '1px solid #E2DED7',
    boxShadow: '0 1px 4px rgba(60,45,30,0.04), 0 8px 24px rgba(60,45,30,0.04)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1E1C1A',
    margin: 0,
    letterSpacing: '-0.1px',
  },
  reservasCountBadge: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#5A9060',
    background: '#EEF6EE',
    border: '1px solid #C8E0C8',
    padding: '2px 9px',
    borderRadius: '20px',
  },
  reservasTable: {
    display: 'flex',
    flexDirection: 'column',
  },
  reservaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 12px 14px 16px',
    borderLeft: '2px solid #C8E0C8',
    borderBottom: '1px solid #EAE7E1',
    transition: 'background 0.15s',
  },
  reservaRowHover: {
    background: '#EFECEA',
    borderRadius: '0 10px 10px 0',
  },
  reservaTime: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#3A6340',
    minWidth: '44px',
    letterSpacing: '-0.2px',
    fontVariantNumeric: 'tabular-nums',
  },
  reservaInfo: {
    flex: 1,
    minWidth: 0,
  },
  reservaName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1E1C1A',
    margin: '0 0 2px 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    letterSpacing: '-0.1px',
  },
  reservaPhone: {
    fontSize: '11px',
    color: '#C0BAB2',
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  reservaMiddle: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexShrink: 0,
  },
  reservaPeople: {
    fontSize: '12px',
    color: '#A09890',
    whiteSpace: 'nowrap',
  },
  reservaBadge: {
    fontSize: '10px',
    fontWeight: '500',
    padding: '3px 9px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.1px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: '14px',
    color: '#B5AFA7',
    margin: '0 0 6px 0',
    fontWeight: '400',
  },
  emptyStateSubtext: {
    fontSize: '12px',
    color: '#C8C3BC',
    margin: 0,
  },

  // ── Chat ────────────────────────────────────────────────────────────────────
  chatSection: {
    background: '#F2F0EC',
    borderRadius: '20px',
    border: '1px solid #E2DED7',
    boxShadow: '0 1px 3px rgba(60,45,30,0.03)',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    height: '540px',
  },
  chatLeft: {
    width: '210px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #E2DED7',
    background: '#EAE7E0',
  },
  chatLeftHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 14px 12px',
    borderBottom: '1px solid #E2DED7',
    flexShrink: 0,
  },
  chatSectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#6A6560',
    margin: 0,
    letterSpacing: '0.1px',
  },
  unreadBadge: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#3A6340',
    background: '#EEF6EE',
    border: '1px solid #C8E0C8',
    padding: '1px 7px',
    borderRadius: '20px',
  },
  threadList: {
    overflowY: 'auto',
    flex: 1,
  },
  emptyThreads: {
    textAlign: 'center',
    padding: '32px 12px',
    color: '#C0BAB2',
    fontSize: '12px',
    margin: 0,
  },
  threadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #E2DED7',
    transition: 'background 0.1s',
  },
  threadRowActive: {
    background: '#E4EFE5',
  },
  threadRowHandoff: {
    background: '#F5EEEC',
    borderLeft: '2px solid #C06050',
  },
  threadAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: '#DDD9D2',
    color: '#7A7570',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  threadAvatarUnread: {
    background: '#C8E8CC',
    color: '#3A6340',
  },
  threadAvatarHandoff: {
    background: '#F0D4D0',
    color: '#8A4030',
  },
  threadInfo: {
    flex: 1,
    minWidth: 0,
  },
  threadMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  threadName: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#3A3835',
    lineHeight: 1.2,
  },
  threadNameUnread: {
    fontWeight: '700',
    color: '#1E1C1A',
  },
  threadNameHandoff: {
    color: '#8A4030',
    fontWeight: '600',
  },
  threadTime: {
    fontSize: '10px',
    color: '#C0BAB2',
    flexShrink: 0,
  },
  threadPreviewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
  },
  threadPreview: {
    fontSize: '11px',
    color: '#C0BAB2',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  threadPreviewUnread: {
    color: '#5A5855',
    fontWeight: '500',
  },
  threadPreviewHandoff: {
    color: '#A06050',
  },
  handoffDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#C06050',
    flexShrink: 0,
  },
  unreadDot: {
    minWidth: '17px',
    height: '17px',
    background: '#4A8050',
    color: '#fff',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: '0 4px',
  },

  // ── Active conversation ──────────────────────────────────────────────────────
  chatRight: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  activeChatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '13px 16px',
    background: '#EAE7E0',
    borderBottom: '1px solid #E2DED7',
    flexShrink: 0,
  },
  activeChatAvatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: '#C8E8CC',
    color: '#3A6340',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activeChatInfo: {
    flex: 1,
    minWidth: 0,
  },
  activeChatName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1E1C1A',
    margin: 0,
    lineHeight: 1.3,
  },
  activeChatPhone: {
    fontSize: '11px',
    color: '#B5AFA7',
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  chatMessages: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
    minHeight: 0,
    padding: '16px 14px 10px',
    background: '#F2F0EC',
  },
  msgRow: {
    display: 'flex',
    gap: '7px',
    alignItems: 'flex-end',
  },
  msgRowOut: {
    flexDirection: 'row-reverse',
  },
  msgAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#C8E8CC',
    color: '#3A6340',
    fontSize: '9px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgBubble: {
    background: '#E8F2E8',
    padding: '8px 12px 6px',
    borderRadius: '4px 14px 14px 14px',
    maxWidth: '82%',
    border: '1px solid #C8DEC8',
    boxShadow: '0 1px 2px rgba(60,45,30,0.05)',
  },
  msgBubbleOut: {
    background: '#FAFAF8',
    border: '1px solid #E8E4DC',
    borderRadius: '14px 4px 14px 14px',
    boxShadow: '0 1px 2px rgba(60,45,30,0.04)',
  },
  msgText: {
    fontSize: '12px',
    color: '#2A2825',
    margin: '0 0 4px 0',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  msgFooter: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  msgTime: {
    fontSize: '10px',
    color: '#C0BAB2',
  },
  msgCheck: {
    fontSize: '10px',
    color: '#4A8050',
  },
  sendError: {
    fontSize: '11px',
    color: '#8A4030',
    padding: '6px 16px',
    background: '#F8F0EE',
    borderTop: '1px solid #E8D4D0',
    flexShrink: 0,
  },
  inputArea: {
    display: 'flex',
    gap: '8px',
    padding: '10px 12px',
    borderTop: '1px solid #E2DED7',
    flexShrink: 0,
    background: '#EAE7E0',
  },
  input: {
    flex: 1,
    padding: '9px 13px',
    border: '1px solid #D8D4CC',
    borderRadius: '12px',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    background: '#F5F3EF',
    color: '#1E1C1A',
  },
  sendBtn: {
    padding: '9px 13px',
    background: '#3A6340',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '18px',
    flexShrink: 0,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyConv: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F2F0EC',
  },
  emptyConvText: {
    fontSize: '13px',
    color: '#C0BAB2',
    margin: 0,
    fontWeight: '400',
  },

  // ── Utilities ────────────────────────────────────────────────────────────────
  empty: { textAlign: 'center', padding: '32px 20px', color: '#C0BAB2', fontSize: '12px' },
  loader: { padding: '80px', textAlign: 'center', color: '#B5AFA7', fontSize: '14px', fontFamily: '-apple-system, sans-serif', letterSpacing: '0.1px' },
  error: { padding: '80px', textAlign: 'center', color: '#8A4030', fontSize: '14px' },
};
