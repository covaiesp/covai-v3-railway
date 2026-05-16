import { useState } from 'react';

const ADMIN_PIN_LENGTH = 4;
const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

// ─── PIN Pad (reusable inside this file) ─────────────────────────────────────
function PinPad({ onComplete, error, loading }) {
  const [pin, setPin] = useState('');

  const handleKey = (key) => {
    if (loading) return;
    if (key === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= ADMIN_PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === ADMIN_PIN_LENGTH) {
      onComplete(next);
      setPin('');
    }
  };

  return (
    <div style={s.pinWrap}>
      <div style={s.dots}>
        {Array.from({ length: ADMIN_PIN_LENGTH }).map((_, i) => (
          <div key={i} style={{ ...s.dot, background: i < pin.length ? '#111' : '#e8e8e3' }} />
        ))}
      </div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.pad}>
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => key && handleKey(key)}
            disabled={loading || !key}
            style={{ ...s.padKey, ...(key === '' ? s.padEmpty : {}), ...(key === '⌫' ? s.padDel : {}) }}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Admin Panel ─────────────────────────────────────────────────────────────
function AdminPanel() {
  const [form, setForm] = useState({ name: '', phone_number: '', twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_from: '' });
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setResult(null);

    if (!form.name.trim()) return setFormError('El nombre es obligatorio.');
    if (!form.phone_number.trim()) return setFormError('El número de teléfono es obligatorio.');

    setLoading(true);
    try {
      const res = await fetch('/api/admin/create-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone_number: form.phone_number,
          twilio_account_sid: form.twilio_account_sid || null,
          twilio_auth_token: form.twilio_auth_token || null,
          twilio_whatsapp_from: form.twilio_whatsapp_from || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Error al crear restaurante.'); return; }
      setResult(data);
      setForm({ name: '', phone_number: '', twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_from: '' });
    } catch {
      setFormError('Error de red. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.logo}>COVAI</span>
        <span style={s.badge}>Admin</span>
      </div>

      <h2 style={s.sectionTitle}>Crear restaurante</h2>

      <form onSubmit={handleCreate} style={s.form}>
        <label style={s.label}>Nombre del restaurante</label>
        <input
          style={s.input}
          type="text"
          placeholder="La Terrazza"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={loading}
        />

        <label style={s.label}>Número de WhatsApp / Twilio</label>
        <input
          style={s.input}
          type="text"
          placeholder="+34612345678"
          value={form.phone_number}
          onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
          disabled={loading}
        />

        <label style={s.label}>Twilio Account SID <span style={s.optional}>(opcional)</span></label>
        <input
          style={s.input}
          type="text"
          placeholder="ACxxxxxxxxxxxxxxxx"
          value={form.twilio_account_sid}
          onChange={(e) => setForm((f) => ({ ...f, twilio_account_sid: e.target.value }))}
          disabled={loading}
        />

        <label style={s.label}>Twilio Auth Token <span style={s.optional}>(opcional)</span></label>
        <input
          style={s.input}
          type="password"
          placeholder="••••••••••••••••"
          value={form.twilio_auth_token}
          onChange={(e) => setForm((f) => ({ ...f, twilio_auth_token: e.target.value }))}
          disabled={loading}
        />

        <label style={s.label}>Número WhatsApp Twilio <span style={s.optional}>(opcional)</span></label>
        <input
          style={s.input}
          type="text"
          placeholder="whatsapp:+14155238886"
          value={form.twilio_whatsapp_from}
          onChange={(e) => setForm((f) => ({ ...f, twilio_whatsapp_from: e.target.value }))}
          disabled={loading}
        />

        {formError && <div style={s.error}>{formError}</div>}

        <button type="submit" style={s.btnCreate} disabled={loading}>
          {loading ? 'Creando…' : 'Crear restaurante'}
        </button>
      </form>

      {result && (
        <div style={s.result}>
          <div style={s.resultTitle}>✓ Restaurante creado</div>
          <div style={s.resultRow}><span style={s.resultKey}>Nombre</span><span>{result.name}</span></div>
          <div style={s.resultRow}><span style={s.resultKey}>PIN</span><span style={s.pin}>{result.access_code}</span></div>
          <div style={s.resultRow}><span style={s.resultKey}>Slug</span><span style={s.mono}>{result.slug}</span></div>
          <div style={s.resultRow}><span style={s.resultKey}>ID</span><span style={s.mono}>{result.id}</span></div>
          <div style={s.resultRow}><span style={s.resultKey}>Teléfono</span><span>{result.phone_number}</span></div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pinError, setPinError] = useState('');
  const [checking, setChecking] = useState(false);

  const handlePin = async (pin) => {
    setChecking(true);
    setPinError('');
    // Small artificial delay so the last dot is visible before feedback
    await new Promise((r) => setTimeout(r, 300));
    if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      setAuthed(true);
    } else {
      setPinError('PIN incorrecto');
    }
    setChecking(false);
  };

  if (authed) return <AdminPanel />;

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>COVAI</div>
        <p style={s.subtitle}>Panel de administración</p>
        <PinPad onComplete={handlePin} error={pinError} loading={checking} />
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  container: {
    minHeight: '100vh',
    background: '#f9f9f7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    padding: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px 32px 32px',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
  },
  logo: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: '0 0 16px',
  },
  pinWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    width: '100%',
  },
  dots: { display: 'flex', gap: '16px' },
  dot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    transition: 'background 0.15s',
  },
  pad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    width: '100%',
  },
  padKey: {
    padding: '16px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#111',
    background: '#f5f5f0',
    border: '1px solid #e8e8e3',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  padEmpty: { background: 'transparent', border: 'none', cursor: 'default' },
  padDel: { background: '#f0f0eb', color: '#555' },
  error: {
    background: '#fef2f2',
    color: '#991b1b',
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #fecaca',
    width: '100%',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  // Panel styles
  panel: {
    minHeight: '100vh',
    background: '#f9f9f7',
    fontFamily: 'Inter, sans-serif',
    padding: '40px 24px',
    maxWidth: '480px',
    margin: '0 auto',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '40px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '600',
    background: '#111',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '20px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#444',
    marginBottom: '2px',
  },
  input: {
    padding: '11px 14px',
    border: '1.5px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '15px',
    fontFamily: 'Inter, sans-serif',
    color: '#111',
    background: '#fff',
    outline: 'none',
  },
  btnCreate: {
    marginTop: '4px',
    padding: '13px',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  result: {
    marginTop: '28px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  resultTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#166534',
    marginBottom: '4px',
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#111',
  },
  resultKey: { color: '#666', fontWeight: '500' },
  pin: { fontWeight: '800', fontSize: '20px', letterSpacing: '4px', fontFamily: 'monospace' },
  mono: { fontFamily: 'monospace', fontSize: '13px', color: '#444' },
  optional: { fontWeight: '400', color: '#aaa', fontSize: '11px' },
};
