import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

function formatDateStatic(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Dashboard({ restaurantId, restaurantSlug, restaurantName }) {
  // ── Existing states ──────────────────────────────────────────────────────────
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [sevenDaysData, setSevenDaysData] = useState([]);
  const [kpis, setKpis] = useState({ today: 0, week: 0, month: 0, lastReservationMinutes: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // ── FASE 1 — new states ───────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  const [showNewResModal, setShowNewResModal] = useState(false);
  const [newResForm, setNewResForm] = useState({ name: '', people: 2, hora: '20:00' });
  const [savingRes, setSavingRes] = useState(false);
  const [saveResError, setSaveResError] = useState('');

  // ── FASE 2 — new states ───────────────────────────────────────────────────────
  const [recentActivity, setRecentActivity] = useState([]);
  const [statusChecks, setStatusChecks] = useState({
    supabase: 'checking', whatsapp: 'checking', openai: 'checking', edge: 'checking',
  });

  const chatMessagesRef = useRef(null);
  const lastThreadRef = useRef(null);

  // ── isMobile detection (no hydration mismatch — runs client-only) ─────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Main data load + intervals ────────────────────────────────────────────────
  useEffect(() => {
    loadAllData();
    loadRecentActivity();
    checkStatus();
    const dataInterval = setInterval(loadAllData, 30_000);
    const activityInterval = setInterval(loadRecentActivity, 30_000);
    const statusInterval = setInterval(checkStatus, 60_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(activityInterval);
      clearInterval(statusInterval);
    };
  }, [restaurantSlug, restaurantId]);

  // ── Chat scroll ───────────────────────────────────────────────────────────────
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

  // ── loadAllData — carousel now 60 days, batch count query ────────────────────
  const loadAllData = async (dateOverride) => {
    try {
      const todayStr = formatDate(new Date());
      const fetchDate = dateOverride || selectedDate;

      // Reservas para la fecha seleccionada (tabla principal) — isolated so failures here don't hide UI
      const { data: selectedRes } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', fetchDate)
        .order('hora', { ascending: true });
      setReservations(selectedRes || []);

      // Reservas HOY — solo KPIs
      const { data: todayRes } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurantSlug)
        .eq('fecha', todayStr)
        .order('hora', { ascending: true });

      // Conversations — isolated: a parse error here must not kill the reservations render
      try {
        const convFetch = await fetch(`/api/conversations?restaurant_id=${restaurantId}`);
        const convRes = convFetch.ok ? await convFetch.json() : [];
        setConversations(Array.isArray(convRes) ? convRes : []);
      } catch {}

      // Handoffs
      const { data: handoffRes } = await supabase
        .from('conversation_states')
        .select('phone_number')
        .eq('restaurant_id', restaurantId)
        .eq('state', 'fallback_human');
      setHandoffPhones(new Set((handoffRes || []).map(r => r.phone_number)));

      // ── Carousel: 60 días, una sola query en lote ─────────────────────────────
      const CAROUSEL_DAYS = 60;
      const now = new Date();
      const maxDate = new Date(now);
      maxDate.setDate(maxDate.getDate() + CAROUSEL_DAYS);
      const maxDateStr = formatDate(maxDate);

      const { data: futureRes } = await supabase
        .from('reservations')
        .select('fecha')
        .eq('restaurant_slug', restaurantSlug)
        .gte('fecha', todayStr)
        .lte('fecha', maxDateStr)
        .neq('status', 'cancelada');

      const countByDate = {};
      (futureRes || []).forEach(r => {
        countByDate[r.fecha] = (countByDate[r.fecha] || 0) + 1;
      });

      const monthDays = [];
      for (let i = 0; i <= CAROUSEL_DAYS; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = formatDate(d);
        monthDays.push({
          date: dateStr,
          day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
          count: countByDate[dateStr] || 0,
          dayNum: d.getDate(),
          isToday: i === 0,
          isFirstOfMonth: d.getDate() === 1,
          monthShort: d.toLocaleDateString('es-ES', { month: 'short' }),
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
    } catch {}
    finally {
      setLoading(false);
    }
  };

  // ── FASE 2: Recent activity from /api/admin/feed ──────────────────────────────
  const loadRecentActivity = async () => {
    try {
      const res = await fetch('/api/admin/feed');
      if (res.ok) {
        const data = await res.json();
        setRecentActivity(Array.isArray(data) ? data.slice(0, 15) : []);
      }
    } catch {}
  };

  // ── FASE 2: Status checks ─────────────────────────────────────────────────────
  const checkStatus = async () => {
    const checks = { supabase: 'offline', whatsapp: 'offline', openai: 'offline', edge: 'offline' };
    try {
      const { error } = await supabase.from('restaurants').select('id').limit(1);
      checks.supabase = error ? 'warning' : 'online';
    } catch { checks.supabase = 'offline'; }

    try {
      const since24h = new Date(Date.now() - 86400_000).toISOString();
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', since24h)
        .limit(1);
      checks.whatsapp = (data && data.length > 0) ? 'online' : 'warning';
    } catch { checks.whatsapp = 'offline'; }

    try {
      const since1h = new Date(Date.now() - 3_600_000).toISOString();
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('message_direction', 'out')
        .gte('created_at', since1h)
        .limit(1);
      checks.openai = (data && data.length > 0) ? 'online' : 'warning';
      checks.edge = checks.openai;
    } catch { checks.openai = 'offline'; checks.edge = 'offline'; }

    setStatusChecks(checks);
  };

  // ── FASE 1: Nueva reserva manual ─────────────────────────────────────────────
  const handleNewReservation = async () => {
    if (!newResForm.name.trim() || !newResForm.people || !newResForm.hora) return;
    setSavingRes(true);
    setSaveResError('');
    const { error: insertErr } = await supabase.from('reservations').insert({
      restaurant_slug: restaurantSlug,
      nombre: newResForm.name.trim(),
      personas: parseInt(newResForm.people),
      fecha: selectedDate,
      hora: newResForm.hora,
      telefono: 'manual',
      status: 'confirmada',
      source: 'manual',
    });
    // DEBUG — remove after diagnosis
    console.log('[COVAI] insert result', { insertErr, selectedDate, restaurantSlug });
    setSavingRes(false);
    if (insertErr) { setSaveResError(insertErr.message); return; }
    setShowNewResModal(false);
    setNewResForm({ name: '', people: 2, hora: '20:00' });
    handleSelectDate(selectedDate);
  };

  // ── FASE 1: Cancelar reserva desde dashboard ──────────────────────────────────
  const handleCancelReservation = async (id) => {
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    await supabase
      .from('reservations')
      .update({ status: 'cancelada', cancelled_at: new Date().toISOString() })
      .eq('id', id);
    handleSelectDate(selectedDate);
  };

  // ── Existing helpers — unchanged ──────────────────────────────────────────────
  const calculateKPIs = (todayData, sevenDays, monthCount) => {
    const todayCount = todayData.length;
    const weekCount = sevenDays.reduce((sum, d) => sum + d.count, 0);
    let lastReservationMinutes = null;
    if (todayData.length > 0) {
      const lastCreated = todayData.map(r => r.created_at).filter(Boolean).sort().reverse()[0];
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

  const handleSelectDate = async (dateStr) => {
    // DEBUG — remove after diagnosis
    console.log('[COVAI] handleSelectDate', { dateStr, restaurantSlug });
    setSelectedDate(dateStr);
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_slug', restaurantSlug)
      .eq('fecha', dateStr)
      .order('hora', { ascending: true });
    // DEBUG — remove after diagnosis
    console.log('[COVAI] handleSelectDate result', { error, count: data?.length, data });
    setReservations(data || []);
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
    const d = new Date(iso.replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d;
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

  // ── FASE 2: Activity helpers ──────────────────────────────────────────────────
  const getActivityIcon = (type) => {
    if (type === 'reservation') return '📅';
    if (type === 'msg_in') return '💬';
    if (type === 'msg_out') return '🤖';
    return '•';
  };

  const getStatusDotColor = (status) => {
    if (status === 'online') return '#4ade80';
    if (status === 'warning') return '#f59e0b';
    if (status === 'checking') return '#94a3b8';
    return '#f87171';
  };

  const getStatusLabel = (status) => {
    if (status === 'online') return 'online';
    if (status === 'warning') return 'inactivo';
    if (status === 'checking') return '...';
    return 'offline';
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

  const todayStr = formatDate(new Date());
  const selectedLabel = selectedDate === todayStr
    ? 'Reservas de hoy'
    : `Reservas del ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // ── Carousel visible cards: 7 desktop, 4 mobile ───────────────────────────────
  const visibleCards = isMobile ? 4 : 7;

  return (
    <div style={{ ...s.root, padding: isMobile ? '20px 16px 40px' : '40px 52px 60px' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{ ...s.header, marginBottom: isMobile ? '20px' : '32px', paddingBottom: isMobile ? '16px' : '24px' }}>
        <div style={s.logoWrap}>
          <span style={s.logoCo}>CO</span>
          <svg width="14" height="22" viewBox="0 0 16 24" fill="none" style={{ display: 'block', margin: '0 1px' }}>
            <polyline points="1,11 8,22 15,2" stroke="#4ade80" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={s.logoAi}>AI</span>
        </div>

        <div style={s.headerCenter}>
          <h1 style={{ ...s.restaurantName, fontSize: isMobile ? '14px' : '16px' }}>{restaurantName}</h1>
          <div style={s.onlineRow}>
            <span style={s.onlineDotSmall} />
            <span style={s.onlineText}>Sistema activo</span>
          </div>
        </div>

        <div style={s.headerRight}>
          {/* ── FASE 2: Status indicators ── */}
          {!isMobile && (
            <div style={s.statusIndicators}>
              {[
                { key: 'supabase', label: 'DB' },
                { key: 'whatsapp', label: 'WA' },
                { key: 'openai',   label: 'AI' },
                { key: 'edge',     label: 'FN' },
              ].map(({ key, label }) => (
                <div key={key} style={s.statusIndicatorItem} title={`${label}: ${getStatusLabel(statusChecks[key])}`}>
                  <span style={{ ...s.statusIndicatorDot, background: getStatusDotColor(statusChecks[key]) }} />
                  <span style={s.statusIndicatorLabel}>{label}</span>
                </div>
              ))}
            </div>
          )}
          {pendingHandoffs > 0 && (
            <div style={s.handoffAlert}>
              <span style={s.handoffAlertDot} />
              {!isMobile && <span style={s.handoffAlertText}>{pendingHandoffs} requiere{pendingHandoffs > 1 ? 'n' : ''} atención</span>}
              {isMobile && <span style={s.handoffAlertText}>{pendingHandoffs}</span>}
            </div>
          )}
          <div style={s.liveBadge} title="Actualización automática cada 30s">
            <span style={s.liveDot} />
            <span style={s.liveText}>live</span>
          </div>
        </div>
      </header>

      {/* ── TIMELINE ────────────────────────────────────────────────────── */}
      {isMobile ? (
        /* Mobile: touch-scrollable carousel, no arrows */
        <div style={s.carouselMobileWrapper}>
          <div style={s.carouselMobileTrack}>
            {sevenDaysData.map((d) => {
              const isSelected = d.date === selectedDate;
              return (
                <div
                  key={d.date}
                  onClick={() => handleSelectDate(d.date)}
                  style={{ ...s.carouselCard, ...s.carouselCardMobile, ...(d.isToday && s.carouselCardToday), ...(isSelected && s.carouselCardSelected) }}
                >
                  {d.isFirstOfMonth && !d.isToday && (
                    <p style={s.carouselMonthBadge}>{d.monthShort}</p>
                  )}
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
      ) : (
        /* Desktop: arrow-based carousel */
        <div style={s.carouselContainer}>
          <button
            style={{ ...s.carouselArrow, opacity: carouselStart === 0 ? 0.25 : 0.7 }}
            onClick={() => setCarouselStart(Math.max(0, carouselStart - 7))}
            disabled={carouselStart === 0}
          >‹</button>
          <div style={s.carouselViewport}>
            <div style={{ ...s.carouselTrack, transform: `translateX(calc(-${carouselStart} * (100% / ${visibleCards})))` }}>
              {sevenDaysData.map((d) => {
                const isSelected = d.date === selectedDate;
                return (
                  <div
                    key={d.date}
                    onClick={() => handleSelectDate(d.date)}
                    style={{ ...s.carouselCard, width: `calc((100% - ${(visibleCards - 1) * 6}px) / ${visibleCards})`, ...(d.isToday && s.carouselCardToday), ...(isSelected && s.carouselCardSelected) }}
                  >
                    {d.isFirstOfMonth && !d.isToday && (
                      <p style={s.carouselMonthBadge}>{d.monthShort}</p>
                    )}
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
            style={{ ...s.carouselArrow, opacity: carouselStart + visibleCards >= sevenDaysData.length ? 0.25 : 0.7 }}
            onClick={() => setCarouselStart(Math.min(sevenDaysData.length - visibleCards, carouselStart + 7))}
            disabled={carouselStart + visibleCards >= sevenDaysData.length}
          >›</button>
        </div>
      )}

      {/* ── STATUS STRIP (KPIs) ──────────────────────────────────────────── */}
      <div style={{ ...s.statusStrip, padding: isMobile ? '12px 16px' : '16px 28px', marginBottom: isMobile ? '14px' : '18px' }}>
        {isMobile ? (
          /* Mobile: 2x2 grid */
          <div style={s.kpiGrid}>
            <div style={s.kpiCell}>
              <span style={{ ...s.statusNum, fontSize: '22px' }}>{kpis.today}</span>
              <span style={s.statusLabel}>hoy</span>
            </div>
            <div style={s.kpiCell}>
              <span style={{ ...s.statusNum, fontSize: '22px' }}>{reservations.reduce((s, r) => s + (r.personas || 0), 0)}</span>
              <span style={s.statusLabel}>{selectedDate === todayStr ? 'personas hoy' : 'personas día'}</span>
            </div>
            <div style={s.kpiCell}>
              <span style={{ ...s.statusNum, fontSize: '22px' }}>{kpis.month}</span>
              <span style={s.statusLabel}>este mes</span>
            </div>
            <div style={s.kpiCell}>
              <span style={{ ...s.statusNum, fontSize: '14px', color: '#A09890' }}>
                {formatLastActivity(kpis.lastReservationMinutes)}
              </span>
              <span style={s.statusLabel}>última</span>
            </div>
          </div>
        ) : (
          /* Desktop: horizontal strip */
          <>
            <div style={s.statusItem}>
              <span style={s.statusNum}>{kpis.today}</span>
              <span style={s.statusLabel}>reservas hoy</span>
            </div>
            <div style={s.statusDivider} />
            <div style={s.statusItem}>
              <span style={s.statusNum}>{reservations.reduce((s, r) => s + (r.personas || 0), 0)}</span>
              <span style={s.statusLabel}>{selectedDate === todayStr ? 'personas hoy' : 'personas este día'}</span>
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
          </>
        )}
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <div style={{ ...s.main, gridTemplateColumns: isMobile ? '1fr' : '5fr 7fr' }}>

        {/* RESERVAS */}
        <section style={s.reservasSection}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>{selectedLabel}</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {reservations.length > 0 && (
                <span style={s.reservasCountBadge}>{reservations.length}</span>
              )}
              {/* ── FASE 1: Nueva reserva button ── */}
              <button
                onClick={() => { setShowNewResModal(true); setSaveResError(''); }}
                style={s.btnNewRes}
                title={`Nueva reserva para ${selectedDate}`}
              >
                ＋ Nueva
              </button>
            </div>
          </div>

          {reservations.length === 0 ? (
            <div style={s.emptyState}>
              <p style={s.emptyStateText}>Sin reservas para este día</p>
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
                    <div style={s.reservaTime}>{String(r.hora || '').slice(0, 5)}</div>
                    <div style={s.reservaInfo}>
                      <p style={s.reservaName}>{r.nombre}</p>
                      <p style={s.reservaPhone}>{r.source === 'manual' ? 'manual' : r.telefono}</p>
                    </div>
                    <div style={s.reservaMiddle}>
                      <span style={s.reservaPeople}>{r.personas} pers.</span>
                      <span style={{ ...s.reservaBadge, background: st.bg, color: st.color }}>{st.label}</span>
                      {/* ── FASE 1: Cancel button per row ── */}
                      {r.status === 'confirmada' && (
                        <button
                          onClick={() => handleCancelReservation(r.id)}
                          style={s.btnCancelRes}
                          title="Cancelar reserva"
                        >✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CONVERSACIONES — hidden on mobile */}
        {!isMobile && (
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
                          {dir === 'in' && <div style={s.msgAvatar}>{activeThread.name[0].toUpperCase()}</div>}
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
        )}
      </div>

      {/* ── FASE 2: Actividad reciente + Estado del sistema ──────────────── */}
      <div style={{ ...s.bottomRow, flexDirection: isMobile ? 'column' : 'row', marginTop: isMobile ? '14px' : '14px' }}>

        {/* Actividad reciente */}
        <section style={{ ...s.activitySection, flex: 2 }}>
          <h2 style={s.sectionTitle}>Actividad reciente</h2>
          <div style={s.activityList}>
            {recentActivity.length === 0 ? (
              <p style={s.emptyActivityText}>Sin actividad reciente</p>
            ) : recentActivity.map(item => (
              <div key={item.id} style={s.activityRow}>
                <span style={s.activityIcon}>{getActivityIcon(item.type)}</span>
                <div style={s.activityBody}>
                  <span style={s.activityText}>
                    {item.name || item.phone}
                    {item.text ? ` — ${item.text.slice(0, 60)}${item.text.length > 60 ? '…' : ''}` : ''}
                  </span>
                  <span style={s.activityMeta}>{item.restaurant} · {formatMsgTime(item.ts)}</span>
                </div>
                {item.type === 'reservation' && item.status && (
                  <span style={{ ...s.reservaBadge, ...getStatusStyle(item.status), background: getStatusStyle(item.status).bg, color: getStatusStyle(item.status).color, fontSize: '9px' }}>
                    {getStatusStyle(item.status).label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Estado del sistema — panel removed, logic preserved */}
      </div>

      {/* ── FASE 1: Nueva reserva modal ──────────────────────────────────── */}
      {showNewResModal && (
        <div style={s.modalOverlay} onClick={() => setShowNewResModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Nueva reserva</h3>
              <p style={s.modalSubtitle}>
                {selectedDate === todayStr
                  ? 'Hoy'
                  : new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <div style={s.modalBody}>
              <label style={s.fieldLabel}>Nombre</label>
              <input
                style={s.fieldInput}
                placeholder="Ej. María García"
                value={newResForm.name}
                onChange={e => setNewResForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />

              <label style={s.fieldLabel}>Personas</label>
              <input
                style={s.fieldInput}
                type="number"
                min={1}
                max={30}
                value={newResForm.people}
                onChange={e => setNewResForm(f => ({ ...f, people: e.target.value }))}
              />

              <label style={s.fieldLabel}>Hora</label>
              <select
                style={s.fieldInput}
                value={newResForm.hora}
                onChange={e => setNewResForm(f => ({ ...f, hora: e.target.value }))}
              >
                {['13:00','13:30','14:00','14:30','15:00','15:30','20:00','20:30','21:00','21:30','22:00','22:30'].map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              {saveResError && <p style={s.saveResError}>{saveResError}</p>}
            </div>

            <div style={s.modalFooter}>
              <button style={s.btnModalCancel} onClick={() => setShowNewResModal(false)}>Cancelar</button>
              <button
                style={{ ...s.btnModalConfirm, opacity: savingRes ? 0.6 : 1 }}
                onClick={handleNewReservation}
                disabled={savingRes}
              >
                {savingRes ? 'Guardando…' : 'Confirmar reserva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {

  root: {
    minHeight: '100vh',
    background: '#EFEDE8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    maxWidth: '1440px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
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
    gap: '8px',
    alignItems: 'center',
    flexShrink: 0,
  },

  // ── FASE 2: Status indicators in header ──────────────────────────────────────
  statusIndicators: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    marginRight: '4px',
  },
  statusIndicatorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'default',
  },
  statusIndicatorDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusIndicatorLabel: {
    fontSize: '10px',
    color: '#B5AFA7',
    fontWeight: '500',
    letterSpacing: '0.3px',
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
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0 10px',
    height: '34px',
    border: '1px solid #E2DED7',
    borderRadius: '10px',
    background: 'transparent',
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#4ade80',
    flexShrink: 0,
  },
  liveText: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#A09890',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.04em',
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
  // Mobile carousel
  carouselMobileWrapper: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    marginBottom: '14px',
    paddingBottom: '4px',
    // Hide scrollbar visually
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
  },
  carouselMobileTrack: {
    display: 'flex',
    gap: '6px',
    width: 'max-content',
    paddingRight: '16px',
  },
  carouselCard: {
    flexShrink: 0,
    padding: '11px 6px',
    background: '#F5F3EF',
    border: '1px solid #E8E4DC',
    borderRadius: '12px',
    textAlign: 'center',
    boxSizing: 'border-box',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    // desktop width set inline per card
    width: 'calc((100% - 36px) / 7)',
  },
  carouselCardMobile: {
    width: '56px',
    padding: '9px 4px',
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
  carouselMonthBadge: {
    fontSize: '7px',
    color: '#A09890',
    margin: '0 0 2px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    lineHeight: 1,
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
  carouselDaySelected: {
    color: '#8FBF98',
  },
  carouselNum: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#2A2825',
    margin: '0 0 5px 0',
    letterSpacing: '-0.5px',
    lineHeight: 1,
  },
  carouselNumSelected: {
    color: '#FFFFFF',
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
  // Mobile KPI grid
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 20px',
    width: '100%',
  },
  kpiCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },

  // ── Main two-column ──────────────────────────────────────────────────────────
  main: {
    display: 'grid',
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
    margin: '0 0 14px 0',
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
  // ── FASE 1: Nueva reserva button ─────────────────────────────────────────────
  btnNewRes: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#3A6340',
    background: '#EEF6EE',
    border: '1px solid #C8E0C8',
    padding: '5px 11px',
    borderRadius: '20px',
    cursor: 'pointer',
    letterSpacing: '0.1px',
  },
  // ── FASE 1: Cancel row button ────────────────────────────────────────────────
  btnCancelRes: {
    background: 'transparent',
    border: '1px solid #E8D4D0',
    borderRadius: '6px',
    color: '#C06050',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    cursor: 'pointer',
    lineHeight: 1,
    flexShrink: 0,
  },
  reservasTable: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '364px',
    overflowY: 'auto',
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
  threadRowActive: { background: '#E4EFE5' },
  threadRowHandoff: { background: '#F5EEEC', borderLeft: '2px solid #C06050' },
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
  threadAvatarUnread: { background: '#C8E8CC', color: '#3A6340' },
  threadAvatarHandoff: { background: '#F0D4D0', color: '#8A4030' },
  threadInfo: { flex: 1, minWidth: 0 },
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
  threadNameUnread: { fontWeight: '700', color: '#1E1C1A' },
  threadNameHandoff: { color: '#8A4030', fontWeight: '600' },
  threadTime: { fontSize: '10px', color: '#C0BAB2', flexShrink: 0 },
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
  threadPreviewUnread: { color: '#5A5855', fontWeight: '500' },
  threadPreviewHandoff: { color: '#A06050' },
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
  activeChatInfo: { flex: 1, minWidth: 0 },
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
  msgRow: { display: 'flex', gap: '7px', alignItems: 'flex-end' },
  msgRowOut: { flexDirection: 'row-reverse' },
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
  msgTime: { fontSize: '10px', color: '#C0BAB2' },
  msgCheck: { fontSize: '10px', color: '#4A8050' },
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

  // ── FASE 2: Bottom row ────────────────────────────────────────────────────────
  bottomRow: {
    display: 'flex',
    gap: '14px',
    alignItems: 'start',
  },
  activitySection: {
    background: '#F8F6F2',
    borderRadius: '20px',
    padding: '24px 26px',
    border: '1px solid #E2DED7',
    boxShadow: '0 1px 4px rgba(60,45,30,0.04)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  emptyActivityText: {
    fontSize: '13px',
    color: '#C0BAB2',
    margin: 0,
    padding: '20px 0',
    textAlign: 'center',
  },
  activityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 0',
    borderBottom: '1px solid #EAE7E1',
  },
  activityIcon: {
    fontSize: '14px',
    flexShrink: 0,
    width: '20px',
    textAlign: 'center',
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  activityText: {
    fontSize: '12px',
    color: '#2A2825',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activityMeta: {
    fontSize: '10px',
    color: '#C0BAB2',
  },
  systemStatusSection: {
    background: '#F8F6F2',
    borderRadius: '20px',
    padding: '24px 26px',
    border: '1px solid #E2DED7',
    boxShadow: '0 1px 4px rgba(60,45,30,0.04)',
    minWidth: '220px',
  },
  systemStatusList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  systemStatusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  systemStatusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  systemStatusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  systemStatusLabel: {
    fontSize: '13px',
    color: '#4A4845',
    fontWeight: '400',
  },
  systemStatusValue: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.2px',
  },

  // ── FASE 1: Modal ─────────────────────────────────────────────────────────────
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(30,28,26,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#FAFAF8',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 20px 60px rgba(30,28,26,0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '24px 26px 16px',
    borderBottom: '1px solid #E8E4DC',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1E1C1A',
    margin: '0 0 4px 0',
    letterSpacing: '-0.3px',
  },
  modalSubtitle: {
    fontSize: '12px',
    color: '#A09890',
    margin: 0,
    textTransform: 'capitalize',
  },
  modalBody: {
    padding: '20px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#8A8480',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    marginTop: '10px',
  },
  fieldInput: {
    padding: '10px 13px',
    border: '1px solid #E2DED7',
    borderRadius: '10px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#1E1C1A',
    background: '#F5F3EF',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  saveResError: {
    fontSize: '11px',
    color: '#8A4030',
    margin: '6px 0 0 0',
    padding: '8px 12px',
    background: '#F8F0EE',
    borderRadius: '8px',
    border: '1px solid #E8D4D0',
  },
  modalFooter: {
    display: 'flex',
    gap: '10px',
    padding: '16px 26px 24px',
    borderTop: '1px solid #E8E4DC',
  },
  btnModalCancel: {
    flex: 1,
    padding: '11px',
    background: 'transparent',
    border: '1px solid #E2DED7',
    borderRadius: '12px',
    fontSize: '13px',
    color: '#8A8480',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnModalConfirm: {
    flex: 2,
    padding: '11px',
    background: '#3A6340',
    border: 'none',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Utilities ────────────────────────────────────────────────────────────────
  loader: { padding: '80px', textAlign: 'center', color: '#B5AFA7', fontSize: '14px', fontFamily: '-apple-system, sans-serif' },
  error: { padding: '80px', textAlign: 'center', color: '#8A4030', fontSize: '14px' },
};
