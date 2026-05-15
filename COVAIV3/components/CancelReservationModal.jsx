import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function CancelReservationModal({ restaurant, onClose, onSuccess }) {
  const [reservations, setReservations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchReservations();
  }, []);

  const fetchReservations = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_slug', restaurant)
        .eq('status', 'confirmada')
        .order('fecha', { ascending: true })
        .limit(20);

      if (fetchError) throw fetchError;
      setReservations(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedId) {
      setError('Selecciona una reserva');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('reservations')
        .update({
          status: 'cancelada',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', selectedId);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err) {
      setError(err.message || 'Error al cancelar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>❌ Cancelar Reserva</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.content}>
          {fetching ? (
            <p style={styles.loading}>Cargando reservas...</p>
          ) : reservations.length === 0 ? (
            <p style={styles.empty}>No hay reservas confirmadas para cancelar</p>
          ) : (
            <>
              <label style={styles.label}>Selecciona una reserva:</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={styles.select}
              >
                <option value="">-- Selecciona --</option>
                {reservations.map((res) => (
                  <option key={res.id} value={res.id}>
                    {res.nombre} - {res.fecha} {res.hora} ({res.personas} personas)
                  </option>
                ))}
              </select>

              {error && <div style={styles.error}>{error}</div>}

              <div style={styles.actions}>
                <button type="button" onClick={onClose} style={styles.btnCancel}>
                  Volver
                </button>
                <button
                  onClick={handleCancel}
                  style={styles.btnDelete}
                  disabled={loading || !selectedId}
                >
                  {loading ? 'Cancelando...' : 'Cancelar Reserva'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
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
  modal: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    width: '100%',
    maxWidth: '400px',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid #e8e8e3',
    paddingBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#111',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#777',
  },
  content: {
    marginTop: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#111',
    marginBottom: '8px',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    marginBottom: '16px',
  },
  loading: {
    color: '#777',
    textAlign: 'center',
    padding: '20px 0',
  },
  empty: {
    color: '#f97316',
    textAlign: 'center',
    padding: '20px 0',
  },
  error: {
    background: '#fef2f2',
    color: '#991b1b',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
    border: '1px solid #fecaca',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  btnCancel: {
    padding: '10px 20px',
    background: '#f5f5f0',
    color: '#111',
    border: '1px solid #e8e8e3',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  btnDelete: {
    padding: '10px 20px',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
