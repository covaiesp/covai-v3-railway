import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';

const PIN_LENGTH = 4;
const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function Landing() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKey = (key) => {
    if (loading) return;
    setError('');
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      if (next.length === PIN_LENGTH) submitPin(next);
    }
  };

  const submitPin = async (value) => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('access_code', value)
        .single();

      if (err || !data) {
        setError('PIN incorrecto');
        setPin('');
        setLoading(false);
        return;
      }

      router.push(`/${data.slug}`);
    } catch {
      setError('Error. Intenta de nuevo.');
      setPin('');
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPin('');
    setError('');
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>COVAI</div>
        <p style={styles.subtitle}>Sistema de Reservas para Restaurantes</p>
      </header>

      <section style={styles.content}>
        <h1 style={styles.title}>Bienvenido</h1>
        <p style={styles.description}>
          Accede a tu panel con tu código PIN
        </p>
        <button onClick={() => setShowModal(true)} style={styles.btnPrimary}>
          Entrar al Panel
        </button>
      </section>

      {showModal && (
        <div style={styles.overlay} onClick={closeModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Ingresa tu PIN</h2>

            {/* Dots indicator */}
            <div style={styles.dots}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dot,
                    background: i < pin.length ? '#111' : '#e8e8e3',
                  }}
                />
              ))}
            </div>

            {error && <div style={styles.error}>{error}</div>}

            {/* Numeric pad */}
            <div style={styles.pad}>
              {KEYS.map((key, i) => (
                <button
                  key={i}
                  onClick={() => key && handleKey(key)}
                  disabled={loading || key === ''}
                  style={{
                    ...styles.padKey,
                    ...(key === '' ? styles.padKeyEmpty : {}),
                    ...(key === '⌫' ? styles.padKeyDelete : {}),
                  }}
                >
                  {loading && key === '0' ? '…' : key}
                </button>
              ))}
            </div>

            <button onClick={closeModal} style={styles.btnCancel}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f9f9f7',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '60px',
  },
  logo: {
    fontSize: '48px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#777',
    margin: 0,
  },
  content: {
    textAlign: 'center',
    maxWidth: '400px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 12px 0',
  },
  description: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 32px 0',
  },
  btnPrimary: {
    width: '100%',
    padding: '14px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px 24px 24px',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111',
    margin: 0,
  },
  dots: {
    display: 'flex',
    gap: '16px',
  },
  dot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    transition: 'background 0.15s',
  },
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
  pad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    width: '100%',
  },
  padKey: {
    padding: '18px 0',
    fontSize: '22px',
    fontWeight: '600',
    color: '#111',
    background: '#f5f5f0',
    border: '1px solid #e8e8e3',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    fontFamily: 'Inter, sans-serif',
  },
  padKeyEmpty: {
    background: 'transparent',
    border: 'none',
    cursor: 'default',
  },
  padKeyDelete: {
    background: '#f0f0eb',
    color: '#555',
  },
  btnCancel: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 0',
  },
};
