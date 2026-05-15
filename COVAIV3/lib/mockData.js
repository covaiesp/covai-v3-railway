// Mock data for La Trattoria demo
// Will be replaced by Supabase queries in production

export const mockReservations = [
  {
    id: '1',
    nombre: 'Carlos Mendoza',
    telefono: '+34 600 123 456',
    hora: '13:00',
    personas: 2,
    fecha: new Date().toISOString().split('T')[0],
    status: 'confirmada',
    notas: 'Mesa preferida cerca ventana',
  },
  {
    id: '2',
    nombre: 'María López',
    telefono: '+34 611 987 654',
    hora: '14:30',
    personas: 4,
    fecha: new Date().toISOString().split('T')[0],
    status: 'confirmada',
    notas: 'Cumpleaños',
  },
  {
    id: '3',
    nombre: 'Ana García',
    telefono: '+34 622 456 789',
    hora: '15:00',
    personas: 3,
    fecha: new Date().toISOString().split('T')[0],
    status: 'pendiente',
    notas: 'Primera vez',
  },
  {
    id: '4',
    nombre: 'Javier Ruiz',
    telefono: '+34 633 789 012',
    hora: '16:30',
    personas: 2,
    fecha: new Date().toISOString().split('T')[0],
    status: 'confirmada',
    notas: 'Cliente habitual',
  },
  {
    id: '5',
    nombre: 'Laura Martínez',
    telefono: '+34 644 321 098',
    hora: '20:00',
    personas: 6,
    fecha: new Date().toISOString().split('T')[0],
    status: 'pendiente',
    notas: 'Evento corporativo',
  },
  {
    id: '6',
    nombre: 'Pedro Sánchez',
    telefono: '+34 655 654 321',
    hora: '21:30',
    personas: 4,
    fecha: new Date().toISOString().split('T')[0],
    status: 'confirmada',
    notas: 'Reservado',
  },
];

export const mockConversations = [
  {
    id: 'c1',
    guest_name: 'María López',
    guest_phone: '+34 611 987 654',
    message_text: '¡Hola! Quisiera confirmar si podemos mantener la reserva para 4 personas mañana a las 14:30.',
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 'c2',
    guest_name: 'María López',
    guest_phone: '+34 611 987 654',
    message_text: 'Claro que sí, tu reserva está confirmada para mañana a las 14:30. ¡Te esperamos! 😊',
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: 'c3',
    guest_name: 'María López',
    guest_phone: '+34 611 987 654',
    message_text: '¡Perfecto, muchas gracias! 🙌',
    created_at: new Date(Date.now() - 1 * 60000).toISOString(),
  },
  {
    id: 'c4',
    guest_name: 'Carlos Mendoza',
    guest_phone: '+34 600 123 456',
    message_text: 'Hola, ¿hay disponibilidad para hoy a las 13:00 para 2 personas?',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'c5',
    guest_name: 'Sistema',
    guest_phone: 'bot',
    message_text: 'Sí, tenemos mesa disponible. ¿A nombre de quién?',
    created_at: new Date(Date.now() - 40 * 60000).toISOString(),
  },
];

export const mockMetrics = {
  today: 6,
  thisWeek: 42,
  thisMonth: 156,
  offHours: 2,
  avgPartySize: 3.5,
  confirmationRate: 83,
};

export const getSevenDaysMetrics = () => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().split('T')[0],
      day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
      dayNum: d.getDate(),
      count: Math.floor(Math.random() * 20) + 10,
    };
  });
};
