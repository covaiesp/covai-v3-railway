import { useState, useEffect, useRef, useCallback } from 'react';

const ADMIN_PIN_LENGTH = 4;
const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const POLL_INTERVAL = 30_000; // 30 segundos

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

function PinPad({ onComplete, error, loading }) {
  const [pin, setPin] = useState('');

  const handleKey = (key) => {
    if (loading) return;
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= ADMIN_PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === ADMIN_PIN_LENGTH) { onComplete(next); setPin(''); }
  };

  return (
    <div style={p.pinWrap}>
      <div style={p.dots}>
        {Array.from({ length: ADMIN_PIN_LENGTH }).map((_, i) => (
          <div key={i} style={{ ...p.dot, background: i < pin.length ? '#F3F1EC' : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>
      {error && <div style={p.pinError}>{error}</div>}
      <div style={p.pad}>
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => key && handleKey(key)}
            disabled={loading || !key}
            style={{ ...p.padKey, ...(key === '' && p.padEmpty), ...(key === '⌫' && p.padDel) }}
          >{key}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Crear Restaurante Modal ──────────────────────────────────────────────────

const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = { mon:'Lun', tue:'Mar', wed:'Mié', thu:'Jue', fri:'Vie', sat:'Sáb', sun:'Dom' };

function buildOpeningHours(form) {
  const hours = {};
  for (const day of DAY_KEYS) {
    if (!form.days.includes(day)) {
      hours[day] = null;
    } else if (form.serviceType === 'continuo') {
      hours[day] = { open: form.openTime, close: form.closeTime };
    } else {
      hours[day] = { open: form.lunchOpen, close: form.lunchClose, dinner_open: form.dinnerOpen, dinner_close: form.dinnerClose };
    }
  }
  return hours;
}

function CreateRestaurantModal({ onClose }) {
  const [form, setForm] = useState({
    name: '', phone_number: '', twilio_account_sid: '',
    twilio_auth_token: '', twilio_whatsapp_from: '',
    serviceType: 'continuo',
    openTime: '13:00', closeTime: '23:00',
    lunchOpen: '13:00', lunchClose: '16:00',
    dinnerOpen: '19:00', dinnerClose: '23:00',
    days: [...DAY_KEYS],
  });
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleDay = (day) => setForm(f => ({
    ...f,
    days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day],
  }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setResult(null);
    if (!form.name.trim()) return setFormError('El nombre es obligatorio.');
    if (!form.phone_number.trim()) return setFormError('El número es obligatorio.');
    if (form.days.length === 0) return setFormError('Seleccioná al menos un día.');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/create-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone_number: form.phone_number,
          opening_hours: buildOpeningHours(form),
          twilio_account_sid: form.twilio_account_sid || null,
          twilio_auth_token: form.twilio_auth_token || null,
          twilio_whatsapp_from: form.twilio_whatsapp_from || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Error al crear.'); return; }
      setResult(data);
      setForm({ name: '', phone_number: '', twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_from: '', serviceType: 'continuo', openTime: '13:00', closeTime: '23:00', lunchOpen: '13:00', lunchClose: '16:00', dinnerOpen: '19:00', dinnerClose: '23:00', days: [...DAY_KEYS] });
    } catch {
      setFormError('Error de red.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.drawer} onClick={e => e.stopPropagation()}>

        <div style={m.drawerHeader}>
          <span style={m.drawerTitle}>Nuevo restaurante</span>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!result ? (
          <form onSubmit={handleCreate} style={m.form}>
            <label style={m.label}>Nombre del restaurante</label>
            <input style={m.input} type="text" placeholder="La Terrazza"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={loading} />

            <label style={m.label}>Número WhatsApp / Twilio</label>
            <input style={m.input} type="text" placeholder="+34612345678"
              value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} disabled={loading} />

            <div style={m.divider} />
            <p style={m.sectionNote}>Horario de apertura</p>

            {/* Tipo de servicio */}
            <div style={m.serviceToggle}>
              {['continuo','partido'].map(t => (
                <button key={t} type="button"
                  style={{ ...m.toggleBtn, ...(form.serviceType === t ? m.toggleBtnActive : {}) }}
                  onClick={() => setForm(f => ({ ...f, serviceType: t }))} disabled={loading}>
                  {t === 'continuo' ? 'Continuo' : 'Partido (comida + cena)'}
                </button>
              ))}
            </div>

            {form.serviceType === 'continuo' ? (
              <div style={m.timeRow}>
                <div style={m.timeField}>
                  <label style={m.label}>Apertura</label>
                  <input style={m.input} type="time" value={form.openTime}
                    onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} disabled={loading} />
                </div>
                <div style={m.timeField}>
                  <label style={m.label}>Cierre</label>
                  <input style={m.input} type="time" value={form.closeTime}
                    onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} disabled={loading} />
                </div>
              </div>
            ) : (
              <>
                <p style={{ ...m.sectionNote, opacity: 0.6 }}>Mediodía</p>
                <div style={m.timeRow}>
                  <div style={m.timeField}>
                    <label style={m.label}>Apertura</label>
                    <input style={m.input} type="time" value={form.lunchOpen}
                      onChange={e => setForm(f => ({ ...f, lunchOpen: e.target.value }))} disabled={loading} />
                  </div>
                  <div style={m.timeField}>
                    <label style={m.label}>Cierre</label>
                    <input style={m.input} type="time" value={form.lunchClose}
                      onChange={e => setForm(f => ({ ...f, lunchClose: e.target.value }))} disabled={loading} />
                  </div>
                </div>
                <p style={{ ...m.sectionNote, opacity: 0.6 }}>Cena</p>
                <div style={m.timeRow}>
                  <div style={m.timeField}>
                    <label style={m.label}>Apertura</label>
                    <input style={m.input} type="time" value={form.dinnerOpen}
                      onChange={e => setForm(f => ({ ...f, dinnerOpen: e.target.value }))} disabled={loading} />
                  </div>
                  <div style={m.timeField}>
                    <label style={m.label}>Cierre</label>
                    <input style={m.input} type="time" value={form.dinnerClose}
                      onChange={e => setForm(f => ({ ...f, dinnerClose: e.target.value }))} disabled={loading} />
                  </div>
                </div>
              </>
            )}

            {/* Días */}
            <label style={m.label}>Días abiertos</label>
            <div style={m.daysRow}>
              {DAY_KEYS.map(day => (
                <button key={day} type="button"
                  style={{ ...m.dayBtn, ...(form.days.includes(day) ? m.dayBtnActive : {}) }}
                  onClick={() => toggleDay(day)} disabled={loading}>
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>

            <div style={m.divider} />
            <p style={m.sectionNote}>Twilio — opcional</p>

            <label style={m.label}>Account SID</label>
            <input style={m.input} type="text" placeholder="ACxxxxxxxxxxxxxxxx"
              value={form.twilio_account_sid} onChange={e => setForm(f => ({ ...f, twilio_account_sid: e.target.value }))} disabled={loading} />

            <label style={m.label}>Auth Token</label>
            <input style={m.input} type="password" placeholder="••••••••••••••••"
              value={form.twilio_auth_token} onChange={e => setForm(f => ({ ...f, twilio_auth_token: e.target.value }))} disabled={loading} />

            <label style={m.label}>Número WhatsApp Twilio</label>
            <input style={m.input} type="text" placeholder="whatsapp:+14155238886"
              value={form.twilio_whatsapp_from} onChange={e => setForm(f => ({ ...f, twilio_whatsapp_from: e.target.value }))} disabled={loading} />

            {formError && <div style={m.formError}>{formError}</div>}

            <button type="submit" style={m.btnSubmit} disabled={loading}>
              {loading ? 'Creando…' : 'Crear restaurante'}
            </button>
          </form>
        ) : (
          <div style={m.resultWrap}>
            <div style={m.resultOk}>✓ Creado correctamente</div>
            <div style={m.resultGrid}>
              <span style={m.rk}>Nombre</span><span style={m.rv}>{result.name}</span>
              <span style={m.rk}>PIN acceso</span><span style={{ ...m.rv, ...m.rvPin }}>{result.access_code}</span>
              <span style={m.rk}>Slug</span><span style={{ ...m.rv, ...m.rvMono }}>{result.slug}</span>
              <span style={m.rk}>ID</span><span style={{ ...m.rv, ...m.rvMono }}>{result.id}</span>
              <span style={m.rk}>Teléfono</span><span style={m.rv}>{result.phone_number}</span>
            </div>
            <button style={m.btnNew} onClick={() => setResult(null)}>Crear otro</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Feed Item ────────────────────────────────────────────────────────────────

function FeedItem({ item }) {
  const isRes = item.type === 'reservation';
  const isIn  = item.type === 'msg_in';

  const dot = isRes ? s.dotGreen : isIn ? s.dotBlue : s.dotMuted;
  const label = isRes ? 'Reserva confirmada' : isIn ? 'Cliente' : 'Bot';

  return (
    <div style={{ ...s.feedItem, ...(isRes ? s.feedItemRes : {}) }}>
      <div style={{ ...s.feedDot, ...dot }} />
      <div style={s.feedBody}>
        <div style={s.feedTop}>
          <span style={{ ...s.feedLabel, fontWeight: isRes ? '600' : '400', color: isRes ? '#F3F1EC' : 'rgba(243,241,236,0.55)' }}>
            {label}
          </span>
          <span style={s.feedRestaurant}>{item.restaurant}</span>
          <span style={{ ...s.feedTime, fontWeight: isRes ? '500' : '400', color: isRes ? 'rgba(243,241,236,0.5)' : 'rgba(243,241,236,0.2)' }}>
            {fmtTime(item.ts)}
          </span>
        </div>
        <p style={{ ...s.feedText, opacity: isRes ? 0.9 : 0.45, fontStyle: isRes ? 'normal' : 'normal' }}>
          {item.text}
        </p>
      </div>
    </div>
  );
}

// ─── Status Dot ──────────────────────────────────────────────────────────────

function StatusPill({ label, ok = true, warn = false }) {
  const color = warn ? '#C9A86A' : ok ? '#7DBB73' : '#B86A6A';
  return (
    <div style={s.statusPill}>
      <div style={{ ...s.statusDot, background: color }} />
      <span style={s.statusLabel}>{label}</span>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, warn = false, danger = false, secondary = false }) {
  const numColor = danger ? '#B86A6A' : warn ? '#C9A86A' : secondary ? 'rgba(243,241,236,0.45)' : '#F3F1EC';
  const cardExtra = danger
    ? { border: '1px solid rgba(184,106,106,0.30)', background: 'rgba(184,106,106,0.07)' }
    : warn
    ? { border: '1px solid rgba(201,168,106,0.25)', background: 'rgba(201,168,106,0.06)' }
    : secondary
    ? { background: 'rgba(52,50,47,0.5)', border: '1px solid rgba(255,255,255,0.04)' }
    : {};
  return (
    <div style={{ ...s.metricCard, ...cardExtra }}>
      <span style={{ ...s.metricNum, color: numColor, fontSize: secondary ? '20px' : '28px' }}>{value ?? '—'}</span>
      <span style={{ ...s.metricLabel, opacity: secondary ? 0.5 : 1 }}>{label}</span>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [stats, setStats]           = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [feed, setFeed]             = useState([]);
  const [kpis, setKpis]             = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading]       = useState(true);
  const feedRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, restRes, feedRes, kpisRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/restaurants-list'),
        fetch('/api/admin/feed'),
        fetch('/api/admin/kpis'),
      ]);
      const [statsData, restData, feedData, kpisData] = await Promise.all([
        statsRes.ok  ? statsRes.json()  : {},
        restRes.ok   ? restRes.json()   : [],
        feedRes.ok   ? feedRes.json()   : [],
        kpisRes.ok   ? kpisRes.json()   : null,
      ]);
      setStats(statsData);
      setRestaurants(Array.isArray(restData) ? restData : []);
      setFeed(Array.isArray(feedData) ? feedData : []);
      setKpis(kpisData);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('admin fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Auto-scroll feed to top on refresh (newest first)
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [feed]);

  const statusOk = !loading;

  return (
    <div style={s.root}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logoWrap}>
            <span style={s.logoCo}>CO</span>
            <svg width="13" height="20" viewBox="0 0 16 24" fill="none" style={{ display: 'block', margin: '0 1px' }}>
              <polyline points="1,11 8,22 15,2" stroke="#7DBB73" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={s.logoAi}>AI</span>
          </div>
          <span style={s.adminBadge}>Admin</span>
          <div style={s.headerSep} />
          <div style={s.onlineRow}>
            <div style={s.onlineDot} />
            <span style={s.onlineText}>Sistema operativo</span>
          </div>
        </div>

        <div style={s.headerRight}>
          {lastRefresh && (
            <span style={s.lastRefresh}>
              Actualizado {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
          <button style={s.btnRefresh} onClick={fetchAll} title="Actualizar">↻</button>
          <button style={s.btnCreate} onClick={() => setShowCreate(true)}>
            + Crear restaurante
          </button>
        </div>
      </header>

      {/* ── STATUS ROW ─────────────────────────────────────────────────── */}
      <div style={s.statusRow}>
        <StatusPill label="Sistema"        ok={statusOk} />
        <StatusPill label="Supabase"       ok={statusOk} />
        <StatusPill label="Edge Functions" ok={statusOk} />
        <StatusPill label="WhatsApp"       ok={statusOk} warn={stats?.fallbacks > 0} />
      </div>

      {/* ── METRICS ────────────────────────────────────────────────────── */}
      <div style={s.metricsRow}>
        {/* HERO */}
        <div style={s.heroCard}>
          <span style={s.heroVal}>{kpis?.recuperados ?? '—'}</span>
          <span style={s.heroLabel}>Recuperados fuera de horario</span>
          <span style={s.heroSub}>reservas confirmadas sin staff · 90 días</span>
        </div>
        {/* PRIMARY */}
        <MetricCard label="% Automáticas"      value={kpis ? `${kpis.pctAutomaticas}%` : '—'} />
        <MetricCard label="Fuera de horario"   value={kpis?.fueraDeHorario} />
        <MetricCard label="Tiempo ahorrado"    value={kpis?.tiempoAhorrado} />
        {/* SECONDARY */}
        <MetricCard label="Fallbacks activos"  value={stats?.fallbacks}
          warn={stats?.fallbacks > 0} danger={stats?.fallbacks > 3} secondary />
        <MetricCard label="Restaurantes activos" value={stats?.activeRestaurants} secondary />
        <MetricCard label="Mensajes hoy"       value={stats?.msgsToday} secondary />
      </div>

      {/* ── OP KPIs ────────────────────────────────────────────────────── */}
      <section style={s.opKpiSection}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Rendimiento operativo</h2>
          <span style={s.sectionSub}>Acumulado · últimos 90 días</span>
        </div>
        <div style={s.opKpiGrid}>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>{kpis?.reservasTotales ?? '—'}</span>
            <span style={s.opKpiLabel}>Reservas totales</span>
          </div>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>{kpis?.fueraDeHorario ?? '—'}</span>
            <span style={s.opKpiLabel}>Fuera de horario</span>
            {kpis?.reservasTotales > 0 && (
              <span style={s.opKpiSub}>
                {Math.round((kpis.fueraDeHorario / kpis.reservasTotales) * 100)}% del total
              </span>
            )}
          </div>
          <div style={{ ...s.opKpiCard, ...s.opKpiAccent }}>
            <span style={{ ...s.opKpiVal, color: '#7DBB73' }}>{kpis?.recuperados ?? '—'}</span>
            <span style={s.opKpiLabel}>Recuperados fuera horario</span>
            <span style={s.opKpiSub}>confirmadas sin staff</span>
          </div>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>{kpis ? `${kpis.pctAutomaticas}%` : '—'}</span>
            <span style={s.opKpiLabel}>Reservas automáticas</span>
            <span style={s.opKpiSub}>sin intervención humana</span>
          </div>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>{kpis?.reservasWhatsapp ?? '—'}</span>
            <span style={s.opKpiLabel}>Reservas WhatsApp</span>
            <span style={s.opKpiSub}>canal único activo</span>
          </div>
          <div style={{ ...s.opKpiCard, ...s.opKpiAccent }}>
            <span style={{ ...s.opKpiVal, color: '#C9A86A' }}>{kpis?.tiempoAhorrado ?? '—'}</span>
            <span style={s.opKpiLabel}>Tiempo ahorrado</span>
            <span style={s.opKpiSub}>≈ 3 min por reserva</span>
          </div>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>{stats?.activeRestaurants ?? '—'}</span>
            <span style={s.opKpiLabel}>Restaurantes activos</span>
            <span style={s.opKpiSub}>con actividad hoy</span>
          </div>
          <div style={s.opKpiCard}>
            <span style={s.opKpiVal}>
              {restaurants.length > 0
                ? timeAgo(restaurants.reduce((latest, r) =>
                    !latest || (r.lastActivity && r.lastActivity > latest) ? r.lastActivity : latest
                  , null))
                : '—'}
            </span>
            <span style={s.opKpiLabel}>Última actividad</span>
            <span style={s.opKpiSub}>cualquier restaurante</span>
          </div>
        </div>
      </section>

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <div style={s.main}>

        {/* FEED */}
        <section style={s.feedSection}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>Actividad live</h2>
            <span style={s.sectionSub}>Últimas 24h</span>
          </div>
          <div ref={feedRef} style={s.feedList}>
            {loading && <p style={s.feedEmpty}>Cargando…</p>}
            {!loading && feed.length === 0 && (
              <p style={s.feedEmpty}>Sin actividad reciente</p>
            )}
            {feed.map(item => <FeedItem key={item.id} item={item} />)}
          </div>
        </section>

        {/* RESTAURANTES */}
        <section style={s.restaurantsSection}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>Restaurantes</h2>
            <span style={s.sectionSub}>{restaurants.length} registrados</span>
          </div>

          <div style={s.table}>
            <div style={s.tableHeader}>
              <span style={{ ...s.th, flex: 2 }}>Restaurante</span>
              <span style={s.th}>Msgs</span>
              <span style={s.th}>Res.</span>
              <span style={s.th}>Fallos</span>
              <span style={{ ...s.th, textAlign: 'right' }}>Última actividad</span>
            </div>

            {loading && <p style={s.feedEmpty}>Cargando…</p>}

            {restaurants.map(r => {
              const statusColor =
                r.status === 'alert'  ? '#C97070' :
                r.status === 'active' ? '#7DBB73' :
                'rgba(255,255,255,0.18)';
              const statusGlow =
                r.status === 'alert'  ? '0 0 7px rgba(201,112,112,0.55)' :
                r.status === 'active' ? '0 0 7px rgba(125,187,115,0.5)' :
                'none';
              return (
                <div key={r.id} style={s.tableRow}>
                  <div style={{ ...s.td, flex: 2, gap: '8px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <div style={{ ...s.statusRowDot, background: statusColor, boxShadow: statusGlow }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={s.restName}>{r.name}</p>
                      <p style={s.restSlug}>{r.slug || '—'}</p>
                    </div>
                  </div>
                  <span style={s.td}>{r.msgsToday}</span>
                  <span style={s.td}>{r.reservasToday}</span>
                  <span style={{
                    ...s.td,
                    color: r.fallbacks > 0 ? '#B86A6A' : 'inherit',
                    fontWeight: r.fallbacks > 0 ? '600' : '400',
                  }}>{r.fallbacks}</span>
                  <span style={{ ...s.td, textAlign: 'right', color: '#B7B1A7' }}>
                    {timeAgo(r.lastActivity)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── MODAL ──────────────────────────────────────────────────────── */}
      {showCreate && <CreateRestaurantModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─── Page (PIN Gate) ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed]   = useState(false);
  const [pinError, setPinError] = useState('');
  const [checking, setChecking] = useState(false);

  const handlePin = async (pin) => {
    setChecking(true);
    setPinError('');
    await new Promise(r => setTimeout(r, 280));
    if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      setAuthed(true);
    } else {
      setPinError('PIN incorrecto');
    }
    setChecking(false);
  };

  if (authed) return <AdminPanel />;

  return (
    <div style={p.container}>
      <div style={p.card}>
        <div style={p.logoWrap}>
          <span style={p.logoCo}>CO</span>
          <svg width="14" height="21" viewBox="0 0 16 24" fill="none" style={{ display: 'block', margin: '0 1px' }}>
            <polyline points="1,11 8,22 15,2" stroke="#7DBB73" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={p.logoAi}>AI</span>
        </div>
        <span style={p.badge}>Admin</span>
        <PinPad onComplete={handlePin} error={pinError} loading={checking} />
      </div>
    </div>
  );
}

// ─── Styles: PIN page ─────────────────────────────────────────────────────────

const p = {
  container: {
    minHeight: '100vh',
    background: '#2B2A27',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
  },
  card: {
    background: '#34322F',
    borderRadius: '20px',
    padding: '40px 32px 36px',
    width: '100%',
    maxWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
  },
  logoCo: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#F3F1EC',
    letterSpacing: '-0.5px',
  },
  logoAi: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#F3F1EC',
    letterSpacing: '-0.5px',
  },
  badge: {
    fontSize: '10px',
    fontWeight: '600',
    background: 'rgba(255,255,255,0.08)',
    color: '#B7B1A7',
    padding: '3px 9px',
    borderRadius: '20px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  pinWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    width: '100%',
    marginTop: '8px',
  },
  dots: { display: 'flex', gap: '14px' },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    transition: 'background 0.15s',
  },
  pinError: {
    fontSize: '12px',
    color: '#B86A6A',
    background: 'rgba(184,106,106,0.10)',
    border: '1px solid rgba(184,106,106,0.25)',
    padding: '8px 14px',
    borderRadius: '6px',
    width: '100%',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  pad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    width: '100%',
  },
  padKey: {
    padding: '15px 0',
    fontSize: '20px',
    fontWeight: '500',
    color: '#F3F1EC',
    background: '#3A3835',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.1s',
  },
  padEmpty: {
    background: 'transparent',
    border: 'none',
    cursor: 'default',
  },
  padDel: {
    color: '#B7B1A7',
  },
};

// ─── Styles: Modal ────────────────────────────────────────────────────────────

const m = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,19,18,0.72)',
    backdropFilter: 'blur(4px)',
    zIndex: 100,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '100%',
    maxWidth: '420px',
    background: '#2B2A27',
    height: '100%',
    overflowY: 'auto',
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    padding: '40px 32px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    boxShadow: '-12px 0 48px rgba(0,0,0,0.55)',
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '28px',
  },
  drawerTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#F3F1EC',
    letterSpacing: '-0.2px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#B7B1A7',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#B7B1A7',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: '-8px',
  },
  input: {
    padding: '12px 15px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#F3F1EC',
    background: '#34322F',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '10px 0 4px',
  },
  sectionNote: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
    margin: '0 0 2px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  formError: {
    fontSize: '12px',
    color: '#B86A6A',
    background: 'rgba(184,106,106,0.10)',
    border: '1px solid rgba(184,106,106,0.25)',
    padding: '10px 13px',
    borderRadius: '6px',
  },
  btnSubmit: {
    marginTop: '4px',
    padding: '13px',
    background: '#3A3835',
    color: '#F3F1EC',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  resultWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  resultOk: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#7DBB73',
    background: 'rgba(125,187,115,0.08)',
    border: '1px solid rgba(125,187,115,0.2)',
    padding: '12px 16px',
    borderRadius: '8px',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '10px 16px',
    alignItems: 'center',
  },
  rk: {
    fontSize: '12px',
    color: '#B7B1A7',
    fontWeight: '500',
  },
  rv: {
    fontSize: '13px',
    color: '#F3F1EC',
  },
  rvPin: {
    fontSize: '22px',
    fontWeight: '800',
    letterSpacing: '6px',
    fontFamily: 'monospace',
    color: '#F3F1EC',
  },
  rvMono: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#B7B1A7',
    wordBreak: 'break-all',
  },
  btnNew: {
    padding: '10px',
    background: 'transparent',
    color: '#B7B1A7',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  serviceToggle: {
    display: 'flex',
    gap: '6px',
  },
  toggleBtn: {
    flex: 1,
    padding: '9px 8px',
    background: '#2B2A27',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#B7B1A7',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  toggleBtnActive: {
    background: '#3A3835',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#F3F1EC',
  },
  timeRow: {
    display: 'flex',
    gap: '10px',
  },
  timeField: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  daysRow: {
    display: 'flex',
    gap: '5px',
    flexWrap: 'wrap',
  },
  dayBtn: {
    padding: '6px 10px',
    background: '#2B2A27',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#B7B1A7',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  dayBtnActive: {
    background: '#3A3835',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#F3F1EC',
  },
};

// ─── Styles: Admin Panel ──────────────────────────────────────────────────────

const s = {
  root: {
    minHeight: '100vh',
    background: '#2B2A27',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
    padding: '40px 52px 72px',
    maxWidth: '1400px',
    margin: '0 auto',
    boxSizing: 'border-box',
    color: '#F3F1EC',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '28px',
    paddingBottom: '24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
  },
  logoCo: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#F3F1EC',
    letterSpacing: '-0.5px',
  },
  logoAi: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#F3F1EC',
    letterSpacing: '-0.5px',
  },
  adminBadge: {
    fontSize: '10px',
    fontWeight: '600',
    background: 'rgba(255,255,255,0.07)',
    color: '#B7B1A7',
    padding: '3px 8px',
    borderRadius: '20px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  headerSep: {
    width: '1px',
    height: '16px',
    background: 'rgba(255,255,255,0.1)',
  },
  onlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  onlineDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#7DBB73',
    flexShrink: 0,
  },
  onlineText: {
    fontSize: '12px',
    color: '#B7B1A7',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  lastRefresh: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.2)',
  },
  btnRefresh: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#B7B1A7',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    cursor: 'pointer',
  },
  btnCreate: {
    padding: '8px 16px',
    background: '#3A3835',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    color: '#F3F1EC',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '-0.1px',
  },

  // Status row — secondary hierarchy
  statusRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    opacity: 0.45,
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
  },
  statusDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '400',
    letterSpacing: '0.03em',
  },

  // Metrics — hero + primary + secondary
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: '180px repeat(3, 1fr) repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '14px',
    alignItems: 'stretch',
  },
  heroCard: {
    background: '#2E2C29',
    border: '1px solid rgba(125,187,115,0.25)',
    borderRadius: '14px',
    padding: '20px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    gridRow: 'span 1',
    justifyContent: 'center',
  },
  heroVal: {
    fontSize: '44px',
    fontWeight: '800',
    letterSpacing: '-2px',
    lineHeight: 1,
    color: '#7DBB73',
    fontVariantNumeric: 'tabular-nums',
  },
  heroLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#F3F1EC',
    letterSpacing: '-0.1px',
    lineHeight: 1.3,
  },
  heroSub: {
    fontSize: '10px',
    color: 'rgba(125,187,115,0.55)',
    letterSpacing: '0.01em',
    marginTop: '2px',
  },
  metricCard: {
    background: '#34322F',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '14px',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metricNum: {
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-1px',
    lineHeight: 1,
    color: '#F3F1EC',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#B7B1A7',
    fontWeight: '400',
    letterSpacing: '0.02em',
  },

  // Main layout
  main: {
    display: 'grid',
    gridTemplateColumns: '3fr 340px',
    gap: '14px',
    alignItems: 'stretch',
  },

  // Feed
  feedSection: {
    background: '#34322F',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '18px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#F3F1EC',
    margin: 0,
    letterSpacing: '-0.1px',
  },
  sectionSub: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
  },
  feedList: {
    overflowY: 'auto',
    flex: 1,
  },
  feedEmpty: {
    padding: '32px 20px',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: '13px',
    margin: 0,
  },
  feedItem: {
    display: 'flex',
    gap: '14px',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    alignItems: 'flex-start',
  },
  feedItemRes: {
    background: 'rgba(125,187,115,0.04)',
    borderLeft: '2px solid rgba(125,187,115,0.35)',
    paddingLeft: '18px',
  },
  feedDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '4px',
  },
  dotGreen: { background: '#7DBB73', boxShadow: '0 0 6px rgba(125,187,115,0.5)' },
  dotBlue:  { background: '#7DA8BB', boxShadow: '0 0 6px rgba(125,168,187,0.4)' },
  dotMuted: { background: 'rgba(255,255,255,0.28)' },
  feedBody: {
    flex: 1,
    minWidth: 0,
  },
  feedTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '2px',
    flexWrap: 'wrap',
  },
  feedLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#F3F1EC',
  },
  feedRestaurant: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.3)',
    flex: 1,
  },
  feedTime: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  feedText: {
    fontSize: '12px',
    color: '#B7B1A7',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Restaurants
  restaurantsSection: {
    background: '#34322F',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '18px',
    overflow: 'hidden',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    padding: '10px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  th: {
    flex: 1,
    fontSize: '10px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  tableRow: {
    display: 'flex',
    padding: '13px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  td: {
    flex: 1,
    fontSize: '13px',
    color: '#F3F1EC',
  },
  restName: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#F3F1EC',
    margin: '0 0 2px 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  restSlug: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.25)',
    margin: 0,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusRowDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  // Op KPI board
  opKpiSection: {
    marginTop: '14px',
    background: '#34322F',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '18px',
    overflow: 'hidden',
  },
  opKpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'rgba(255,255,255,0.05)',
  },
  opKpiCard: {
    background: '#34322F',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  opKpiAccent: {
    background: '#302E2B',
  },
  opKpiVal: {
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    color: '#F3F1EC',
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
  opKpiLabel: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#B7B1A7',
    letterSpacing: '0.01em',
  },
  opKpiSub: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: '0.01em',
  },
};
