import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase-client';

export default function Landing() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmitPin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (pin.length !== 6) {
      setError('PIN debe ser 6 dígitos');
      setLoading(false);
      return;
    }

    try {
      const { data, error: err } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('access_code', pin)
        .single();

      if (err || !data) {
        setError('PIN inválido');
        setLoading(false);
        return;
      }

      router.push(`/${data.slug}`);
    } catch (err) {
      setError('Error. Intenta de nuevo.');
      setLoading(false);
    }
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
          Accede a tu panel de reservas con tu código PIN
        </p>

        <button
          onClick={() => setShowModal(true)}
          style={styles.btnPrimary}
        >
          Entrar al Panel
        </button>
      </section>

      {showModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Ingresa tu PIN</h2>
            
            <form onSubmit={handleSubmitPin} style={styles.form}>
              <input
                type="text"
                inputMode="numeric"
                maxLength="6"
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                style={styles.input}
                disabled={loading}
              />

              {error && <div style={styles.error}>{error}</div>}

              <div style={styles.formButtons}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setPin('');
                    setError('');
                  }}
                  style={styles.btnCancel}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={styles.btnSubmit}
                  disabled={loading}
                >
                  {loading ? 'Validando...' : 'Entrar'}
                </button>
              </div>
            </form>
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
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#fff',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '400px',
    width: '100%',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 24px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    padding: '12px 16px',
    border: '2px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '24px',
    textAlign: 'center',
    letterSpacing: '8px',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  error: {
    background: '#fef2f2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #fecaca',
  },
  formButtons: {
    display: 'flex',
    gap: '12px',
  },
  btnCancel: {
    flex: 1,
    padding: '12px',
    background: '#f5f5f0',
    color: '#111',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btnSubmit: {
    flex: 1,
    padding: '12px',
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
