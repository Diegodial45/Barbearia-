import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserRole, Service, Booking, TimeSlot, ShopSettings, Review } from './types';
import { ServiceCard } from './components/ServiceCard';
import { NotificationToast } from './components/NotificationToast';
import { generateBookingConfirmation, generateDaySummary } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// --- INITIAL DATA ---
const INITIAL_SHOP_SETTINGS: ShopSettings = {
  name: "BARBEARIA GONÇALVES",
  tagline: "O Futuro do Estilo"
};

const INITIAL_SERVICES: Service[] = [
  { 
    id: '1', 
    name: 'Degradê Neon', 
    description: 'Degradê na pele com precisão, acabamento na navalha e estilização.', 
    price: 45, 
    durationMinutes: 45, 
    // Sharp skin fade side profile
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=800&auto=format&fit=crop' 
  },
  { 
    id: '2', 
    name: 'Cavalheiro Clássico', 
    description: 'Corte na tesoura, toalha quente e aparo de barba.', 
    price: 55, 
    durationMinutes: 60, 
    // Styled hair with full beard
    image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=800&auto=format&fit=crop' 
  },
  { 
    id: '3', 
    name: 'Escultura de Barba', 
    description: 'Modelagem detalhada da barba com tratamento de óleo quente.', 
    price: 30, 
    durationMinutes: 30, 
    // Beard focus/trimming
    image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?q=80&w=800&auto=format&fit=crop' 
  },
  { 
    id: '4', 
    name: 'Máquina Rápida', 
    description: 'Corte padrão na máquina. Sem frescura, apenas limpo.', 
    price: 25, 
    durationMinutes: 20, 
    // Short textured crop with fade
    image: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=800&auto=format&fit=crop' 
  },
];

const INITIAL_BOOKINGS: Booking[] = [
  { id: '101', serviceId: '1', serviceName: 'Degradê Neon', customerName: 'John Wick', customerPhone: '555-0101', date: new Date().toISOString().split('T')[0], time: '10:00', status: 'confirmed' },
  { id: '102', serviceId: '3', serviceName: 'Escultura de Barba', customerName: 'Tony Stark', customerPhone: '555-0102', date: new Date().toISOString().split('T')[0], time: '14:30', status: 'confirmed' },
  // Historical data with Reviews
  { 
    id: '99', 
    serviceId: '2', 
    serviceName: 'Cavalheiro Clássico', 
    customerName: 'Bruce Wayne', 
    customerPhone: '555-0099', 
    date: '2023-10-25', 
    time: '18:00', 
    status: 'completed',
    review: { rating: 5, comment: 'Serviço impecável. O ambiente é incrível.', date: '2023-10-25' }
  },
  { 
    id: '98', 
    serviceId: '4', 
    serviceName: 'Máquina Rápida', 
    customerName: 'Clark Kent', 
    customerPhone: '555-0098', 
    date: '2023-10-24', 
    time: '09:00', 
    status: 'completed',
    review: { rating: 4, comment: 'Rápido e eficiente, como prometido.', date: '2023-10-24' }
  },
];

// --- HELPER FUNCTIONS ---
const generateTimeSlots = (date: string, existingBookings: Booking[]): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startHour = 9; // 9 AM
  const endHour = 18; // 6 PM
  
  const bookingsOnDate = existingBookings.filter(b => b.date === date && b.status !== 'cancelled');

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      const isTaken = bookingsOnDate.some(b => b.time === timeString);
      slots.push({ time: timeString, available: !isTaken });
    }
  }
  return slots;
};

// --- APP COMPONENT ---
const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  
  // -- PERSISTENT STATE INITIALIZATION --
  
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => {
    const saved = localStorage.getItem('neoncuts_settings');
    return saved ? JSON.parse(saved) : INITIAL_SHOP_SETTINGS;
  });

  const [services, setServices] = useState<Service[]>(() => {
    const saved = localStorage.getItem('neoncuts_services');
    return saved ? JSON.parse(saved) : INITIAL_SERVICES;
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('neoncuts_bookings');
    return saved ? JSON.parse(saved) : INITIAL_BOOKINGS;
  });

  const [notification, setNotification] = useState<{message: string, isVisible: boolean}>({ message: '', isVisible: false });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Client State
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '' });
  const [isBooking, setIsBooking] = useState(false);
  
  // Review State (Client)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ 
    serviceId: '', 
    rating: 5, 
    comment: '', 
    customerName: '' 
  });

  // Barber Dashboard State
  const [barberMotivationalMsg, setBarberMotivationalMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'services' | 'settings' | 'history' | 'reviews'>('dashboard');
  
  // Edit States (Modals)
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  // --- DERIVED STATE ---
  const averageRating = useMemo(() => {
    const reviewedBookings = bookings.filter(b => b.review);
    if (reviewedBookings.length === 0) return 0;
    const total = reviewedBookings.reduce((sum, b) => sum + (b.review?.rating || 0), 0);
    return (total / reviewedBookings.length).toFixed(1);
  }, [bookings]);

  const reviewCount = useMemo(() => bookings.filter(b => b.review).length, [bookings]);

  // --- EFFECTS ---
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'client') {
      setCurrentRole(UserRole.CLIENT);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('neoncuts_settings', JSON.stringify(shopSettings));
    document.title = `${shopSettings.name} - Agendamento`;
  }, [shopSettings]);

  useEffect(() => {
    localStorage.setItem('neoncuts_services', JSON.stringify(services));
  }, [services]);

  useEffect(() => {
    localStorage.setItem('neoncuts_bookings', JSON.stringify(bookings));
  }, [bookings]);


  // --- HANDLERS (BOOKING & CLIENT) ---

  const handleBookAppointment = async () => {
    if (!selectedService || !selectedDate || !selectedTime || !customerForm.name) return;

    setIsBooking(true);
    const newBooking: Booking = {
      id: Date.now().toString(),
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      customerName: customerForm.name,
      customerPhone: customerForm.phone,
      date: selectedDate,
      time: selectedTime,
      status: 'confirmed',
    };

    const aiMsg = await generateBookingConfirmation(newBooking, shopSettings.name);
    newBooking.aiConfirmationMessage = aiMsg;

    setBookings(prev => [...prev, newBooking]);
    setNotification({ message: aiMsg, isVisible: true });
    
    setTimeout(() => {
      setIsBooking(false);
      setSelectedService(null);
      setSelectedTime('');
      setCustomerForm({ name: '', phone: '' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 2000);
  };

  const handleSubmitReview = () => {
    if (!reviewForm.serviceId || !reviewForm.customerName) {
      setNotification({ message: "Preencha todos os campos para avaliar.", isVisible: true, type: 'info' });
      return;
    }

    // Since we don't have real user auth, we create a 'Completed' booking record to store the review
    // This simulates a past appointment being reviewed.
    const service = services.find(s => s.id === reviewForm.serviceId);
    
    const newReviewedBooking: Booking = {
      id: `review-${Date.now()}`,
      serviceId: reviewForm.serviceId,
      serviceName: service?.name || 'Serviço Diverso',
      customerName: reviewForm.customerName,
      customerPhone: 'N/A',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
      status: 'completed',
      review: {
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        date: new Date().toISOString().split('T')[0]
      }
    };

    setBookings(prev => [...prev, newReviewedBooking]);
    setIsReviewModalOpen(false);
    setReviewForm({ serviceId: '', rating: 5, comment: '', customerName: '' });
    setNotification({ message: "Obrigado pela sua avaliação!", isVisible: true });
  };

  const handleBarberLogin = useCallback(async () => {
    setCurrentRole(UserRole.BARBER);
    const today = new Date().toISOString().split('T')[0];
    const todaysBookings = bookings.filter(b => b.date === today && b.status === 'confirmed');
    const msg = await generateDaySummary(todaysBookings, shopSettings.name);
    setBarberMotivationalMsg(msg);
  }, [bookings, shopSettings.name]);

  const handleExit = () => {
    setCurrentRole(UserRole.NONE);
    window.history.pushState({}, '', window.location.pathname);
  };

  const copyBookingLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=client`;
    navigator.clipboard.writeText(url).then(() => {
      setNotification({ message: "Link copiado! Envie para seus clientes.", isVisible: true });
    }).catch(() => {
      setNotification({ message: "Erro ao copiar link.", isVisible: true, type: 'info' });
    });
  };

  const refreshDashboard = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    const today = new Date().toISOString().split('T')[0];
    const todaysBookings = bookings.filter(b => b.date === today && b.status === 'confirmed');
    const msg = await generateDaySummary(todaysBookings, shopSettings.name);
    setBarberMotivationalMsg(msg);
    setIsRefreshing(false);
    setNotification({ message: "Agenda atualizada com novos insights!", isVisible: true });
  };

  // --- HANDLERS (ADMIN / EDIT) ---

  const handleSaveService = () => {
    if (!editingService?.name || !editingService?.price) return;
    
    if (editingService.id) {
      setServices(prev => prev.map(s => s.id === editingService.id ? { ...s, ...editingService } as Service : s));
      setNotification({ message: "Serviço atualizado!", isVisible: true });
    } else {
      const newService: Service = {
        ...editingService,
        id: Date.now().toString(),
        image: editingService.image || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=800&auto=format&fit=crop', 
        durationMinutes: editingService.durationMinutes || 30
      } as Service;
      setServices(prev => [...prev, newService]);
      setNotification({ message: "Novo serviço adicionado!", isVisible: true });
    }
    setIsServiceModalOpen(false);
    setEditingService(null);
  };

  const handleDeleteService = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este serviço?")) {
      setServices(prev => prev.filter(s => s.id !== id));
      setNotification({ message: "Serviço excluído.", isVisible: true });
    }
  };

  const handleUpdateBooking = () => {
    if (!editingBooking) return;
    setBookings(prev => prev.map(b => b.id === editingBooking.id ? editingBooking : b));
    setIsBookingModalOpen(false);
    setEditingBooking(null);
    setNotification({ message: "Agendamento atualizado.", isVisible: true });
  };

  const handleCompleteBooking = (id: string) => {
     setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'completed' } : b));
     setNotification({ message: "Serviço concluído e arquivado!", isVisible: true });
  };

  // --- MODALS ---

  const renderServiceModal = () => {
    if (!isServiceModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-lg shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-4">{editingService?.id ? 'Editar Serviço' : 'Novo Serviço'}</h2>
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Nome do Serviço</label>
              <input 
                value={editingService?.name || ''} 
                onChange={e => setEditingService(prev => ({...prev, name: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-slate-400 text-xs uppercase font-bold">Preço (R$)</label>
                <input 
                  type="number"
                  value={editingService?.price || ''} 
                  onChange={e => setEditingService(prev => ({...prev, price: Number(e.target.value)}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                />
              </div>
              <div className="flex-1">
                <label className="text-slate-400 text-xs uppercase font-bold">Duração (min)</label>
                <input 
                  type="number"
                  value={editingService?.durationMinutes || ''} 
                  onChange={e => setEditingService(prev => ({...prev, durationMinutes: Number(e.target.value)}))}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">URL da Imagem</label>
              <input 
                value={editingService?.image || ''} 
                onChange={e => setEditingService(prev => ({...prev, image: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Descrição</label>
              <textarea 
                value={editingService?.description || ''} 
                onChange={e => setEditingService(prev => ({...prev, description: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-24" 
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsServiceModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
              <button onClick={handleSaveService} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBookingModal = () => {
    if (!isBookingModalOpen || !editingBooking) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-lg shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-4">Editar Agendamento</h2>
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Cliente</label>
              <input 
                value={editingBooking.customerName} 
                onChange={e => setEditingBooking(prev => prev ? ({...prev, customerName: e.target.value}) : null)}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
              />
            </div>
            <div className="flex gap-4">
               <div className="flex-1">
                <label className="text-slate-400 text-xs uppercase font-bold">Data</label>
                <input 
                  type="date"
                  value={editingBooking.date} 
                  onChange={e => setEditingBooking(prev => prev ? ({...prev, date: e.target.value}) : null)}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                />
              </div>
              <div className="flex-1">
                <label className="text-slate-400 text-xs uppercase font-bold">Hora</label>
                <input 
                  type="time"
                  value={editingBooking.time} 
                  onChange={e => setEditingBooking(prev => prev ? ({...prev, time: e.target.value}) : null)}
                  className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white" 
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Status</label>
              <select 
                 value={editingBooking.status}
                 onChange={e => setEditingBooking(prev => prev ? ({...prev, status: e.target.value as any}) : null)}
                 className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
              >
                <option value="confirmed">Confirmado</option>
                <option value="cancelled">Cancelado</option>
                <option value="completed">Concluído</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsBookingModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
              <button onClick={handleUpdateBooking} className="px-4 py-2 bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold rounded">Atualizar</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderReviewModal = () => {
    if (!isReviewModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in-up">
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-2">Avaliar Experiência</h2>
          <p className="text-slate-400 mb-6 text-sm">Sua opinião ajuda a melhorar nosso estilo.</p>
          
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Seu Nome</label>
              <input 
                value={reviewForm.customerName}
                onChange={e => setReviewForm(prev => ({...prev, customerName: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-cyan-400 outline-none"
                placeholder="Ex: João da Silva"
              />
            </div>

            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Qual serviço você realizou?</label>
              <select 
                value={reviewForm.serviceId}
                onChange={e => setReviewForm(prev => ({...prev, serviceId: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-cyan-400 outline-none appearance-none"
              >
                <option value="" disabled>Selecione um serviço</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 text-xs uppercase font-bold mb-2 block">Classificação</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button 
                    key={star}
                    onClick={() => setReviewForm(prev => ({...prev, rating: star}))}
                    className={`p-2 rounded-full transition-all transform hover:scale-110 ${reviewForm.rating >= star ? 'text-yellow-400' : 'text-slate-600'}`}
                  >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-xs uppercase font-bold">Comentário</label>
              <textarea 
                value={reviewForm.comment}
                onChange={e => setReviewForm(prev => ({...prev, comment: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white h-24 focus:border-cyan-400 outline-none resize-none"
                placeholder="Conta pra gente o que achou..."
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setIsReviewModalOpen(false)}
                className="flex-1 py-3 text-slate-400 hover:text-white font-bold"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmitReview}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-lg shadow-lg"
              >
                Enviar Avaliação
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- VIEWS ---

  const renderLanding = () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-fuchsia-500/20 rounded-full blur-[100px]" />

      <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 mb-8 tracking-tighter text-center px-4">
        {shopSettings.name}
      </h1>
      <p className="text-slate-400 mb-12 text-xl font-light tracking-wide">{shopSettings.tagline}</p>
      
      <div className="flex flex-col sm:flex-row gap-8 z-10">
        <button 
          onClick={() => setCurrentRole(UserRole.CLIENT)}
          className="group relative px-8 py-4 bg-transparent border border-cyan-400 text-cyan-400 font-bold uppercase tracking-widest rounded-none hover:bg-cyan-400 hover:text-slate-900 transition-all duration-300"
        >
          Agendar Corte
          <div className="absolute inset-0 bg-cyan-400/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </button>
        <button 
          onClick={handleBarberLogin}
          className="group relative px-8 py-4 bg-transparent border border-fuchsia-500 text-fuchsia-500 font-bold uppercase tracking-widest rounded-none hover:bg-fuchsia-500 hover:text-slate-900 transition-all duration-300"
        >
          Acesso Barbeiro
          <div className="absolute inset-0 bg-fuchsia-500/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </button>
      </div>
    </div>
  );

  const renderClientView = () => {
    const timeSlots = generateTimeSlots(selectedDate, bookings);

    return (
      <div className="min-h-screen bg-slate-900 pb-20">
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleExit}>
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-fuchsia-500 rounded-lg"></div>
            <span className="font-bold text-xl tracking-tight text-white">{shopSettings.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsReviewModalOpen(true)}
              className="text-sm font-bold text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-full transition-colors hidden sm:block"
            >
              Avaliar Corte Anterior
            </button>
            <button onClick={handleExit} className="text-sm text-slate-400 hover:text-white">Sair</button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-6 space-y-12">
          {/* Gallery */}
          <section className="animate-fade-in-up">
             <div className="mb-6 flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">Galeria de Inspiração</h2>
                  <p className="text-slate-400">Toque em um estilo para selecioná-lo.</p>
                </div>
                {/* Mobile only review button */}
                <button 
                  onClick={() => setIsReviewModalOpen(true)}
                  className="sm:hidden text-xs font-bold text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-full"
                >
                  Avaliar Corte
                </button>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {services.map(service => (
                 <div 
                   key={service.id}
                   onClick={() => setSelectedService(service)}
                   className={`
                     group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300
                     ${selectedService?.id === service.id 
                       ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] scale-105 z-10' 
                       : 'border-transparent hover:border-slate-600 hover:scale-[1.02]'}
                   `}
                 >
                   <img src={service.image} alt={service.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                   <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/20 to-transparent flex flex-col justify-end p-4">
                     <span className="text-white font-bold text-lg leading-tight">{service.name}</span>
                     <span className="text-cyan-400 text-sm font-semibold mt-1">R$ {service.price}</span>
                   </div>
                   {selectedService?.id === service.id && (
                     <div className="absolute top-2 right-2 bg-cyan-400 text-slate-900 p-1.5 rounded-full shadow-lg">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                     </div>
                   )}
                 </div>
               ))}
             </div>
             
             <div className="mt-8 flex justify-center">
                <button 
                  onClick={() => document.getElementById('service-selection')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-cyan-500/50 transform hover:scale-105 transition-all duration-300 uppercase tracking-wider flex items-center gap-2"
                >
                  Agendar Agora
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                </button>
             </div>
          </section>
          
          {/* Detailed View */}
          <section id="service-selection">
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center">
              <span className="bg-cyan-400 text-slate-900 text-sm font-bold px-2 py-1 rounded mr-3">01</span>
              Detalhes do Serviço
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {services.map(service => (
                <ServiceCard 
                  key={service.id} 
                  service={service} 
                  selected={selectedService?.id === service.id}
                  onSelect={setSelectedService} 
                />
              ))}
            </div>
          </section>

          {/* Date & Time */}
          {selectedService && (
            <section className="animate-fade-in-up">
              <h2 className="text-3xl font-bold text-white mb-6 flex items-center">
                <span className="bg-fuchsia-500 text-white text-sm font-bold px-2 py-1 rounded mr-3">02</span>
                Data e Hora
              </h2>
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div className="mb-6">
                  <label className="block text-slate-400 text-sm mb-2 uppercase font-bold tracking-wider">Escolha uma Data</label>
                  <input 
                    type="date" 
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-400 outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-400 text-sm mb-2 uppercase font-bold tracking-wider">Horários Disponíveis</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {timeSlots.map(slot => (
                      <button
                        key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`
                          py-2 rounded-lg text-sm font-bold transition-all
                          ${!slot.available ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 
                            selectedTime === slot.time ? 'bg-cyan-400 text-slate-900 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 
                            'bg-slate-700 text-slate-300 hover:bg-slate-600'}
                        `}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Booking Form */}
          {selectedService && selectedTime && (
            <section className="animate-fade-in-up">
              <h2 className="text-3xl font-bold text-white mb-6 flex items-center">
                <span className="bg-lime-400 text-slate-900 text-sm font-bold px-2 py-1 rounded mr-3">03</span>
                Garantir Vaga
              </h2>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl">
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-slate-400 text-xs uppercase font-bold mb-1">Nome</label>
                      <input 
                        type="text" 
                        placeholder="Seu Nome Completo"
                        value={customerForm.name}
                        onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs uppercase font-bold mb-1">Telefone</label>
                      <input 
                        type="tel" 
                        placeholder="(11) 99999-9999"
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-400 outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <div>
                      <h3 className="text-white font-bold text-lg mb-1">{selectedService.name}</h3>
                      <p className="text-slate-400 text-sm">{new Date(selectedDate).toLocaleDateString('pt-BR')} às {selectedTime}</p>
                    </div>
                    <div className="mt-4 flex justify-between items-end border-t border-slate-800 pt-4">
                      <span className="text-slate-500 text-sm">Total a Pagar</span>
                      <span className="text-2xl font-bold text-cyan-400">R$ {selectedService.price}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBookAppointment}
                  disabled={!customerForm.name || isBooking}
                  className={`
                    mt-8 w-full py-4 rounded-xl font-black uppercase tracking-widest text-lg transition-all
                    ${!customerForm.name ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 
                      'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg transform hover:-translate-y-1'}
                  `}
                >
                  {isBooking ? 'Processando...' : 'Confirmar Agendamento'}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    );
  };

  const renderBarberDashboard = () => {
    // Basic stats
    const today = new Date().toISOString().split('T')[0];
    const todaysAppointments = bookings.filter(b => b.date === today && b.status !== 'cancelled').sort((a,b) => a.time.localeCompare(b.time));
    const totalRev = bookings.filter(b => b.status === 'completed' || (b.status === 'confirmed' && b.date === today)).reduce((acc, curr) => {
        const service = services.find(s => s.id === curr.serviceId);
        return acc + (service ? service.price : 0);
    }, 0);

    const historyBookings = bookings.filter(b => b.status === 'completed').sort((a,b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime());
    const reviews = bookings.filter(b => b.review).sort((a,b) => new Date(b.review!.date).getTime() - new Date(a.review!.date).getTime());

    const chartData = [
      { name: 'Seg', count: 4 },
      { name: 'Ter', count: 6 },
      { name: 'Qua', count: 8 },
      { name: 'Qui', count: 5 },
      { name: 'Sex', count: 12 },
      { name: 'Sáb', count: 15 },
      { name: 'Dom', count: 3 },
    ];

    return (
      <div className="min-h-screen bg-slate-900 flex">
        {/* Sidebar */}
        <aside className="w-20 lg:w-64 bg-slate-950 border-r border-slate-800 flex flex-col fixed h-full z-20 transition-all">
          <div className="p-6 flex items-center justify-center lg:justify-start gap-3 border-b border-slate-800 h-20">
            <div className="w-8 h-8 bg-fuchsia-500 rounded-lg shrink-0"></div>
            <span className="hidden lg:block font-bold text-xl text-white tracking-tighter truncate">{shopSettings.name}</span>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <div 
              onClick={() => setActiveTab('dashboard')}
              className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'dashboard' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              <span className="hidden lg:block font-medium">Painel</span>
            </div>
            <div 
              onClick={() => setActiveTab('history')}
              className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'history' ? 'bg-slate-800 text-yellow-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span className="hidden lg:block font-medium">Histórico</span>
            </div>
            <div 
              onClick={() => setActiveTab('services')}
              className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'services' ? 'bg-slate-800 text-fuchsia-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
              <span className="hidden lg:block font-medium">Serviços</span>
            </div>
            <div 
              onClick={() => setActiveTab('reviews')}
              className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'reviews' ? 'bg-slate-800 text-orange-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
              <span className="hidden lg:block font-medium">Avaliações</span>
            </div>
            <div 
              onClick={() => setActiveTab('settings')}
              className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'settings' ? 'bg-slate-800 text-lime-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              <span className="hidden lg:block font-medium">Configurações</span>
            </div>
          </nav>
          <div className="p-4 border-t border-slate-800">
            <button onClick={handleExit} className="w-full p-2 text-slate-400 hover:text-white flex items-center justify-center lg:justify-start gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              <span className="hidden lg:block">Sair</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 ml-20 lg:ml-64 p-8 overflow-y-auto">
          
          {activeTab === 'dashboard' && (
            <div className="animate-fade-in-up">
              <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-white mb-2">Painel de Controle</h1>
                  <p className="text-fuchsia-400 italic text-sm max-w-xl">{barberMotivationalMsg || "Gerando seus insights diários..."}</p>
                </div>
                
                <div className="flex items-center gap-6 self-end md:self-center">
                  <button 
                    onClick={copyBookingLink}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-cyan-400/20 transition-all"
                  >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                     Copiar Link de Agendamento
                  </button>

                  <button 
                    onClick={refreshDashboard}
                    disabled={isRefreshing}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all border
                      ${isRefreshing 
                        ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' 
                        : 'bg-slate-800 border-slate-700 hover:border-cyan-400 text-cyan-400 hover:bg-slate-800/80 shadow-lg hover:shadow-cyan-400/20'}
                    `}
                  >
                    <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    {isRefreshing ? 'Atualizando...' : 'Atualizar Agenda'}
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Stat Cards */}
                 <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                    <p className="text-slate-400 text-xs uppercase font-bold mb-1">Receita Total</p>
                    <p className="text-3xl font-black text-white">R$ {totalRev}</p>
                 </div>
                 
                 <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <svg className="w-24 h-24 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    </div>
                    <p className="text-slate-400 text-xs uppercase font-bold mb-1">Satisfação do Cliente</p>
                    <div className="flex items-end gap-2">
                       <p className="text-3xl font-black text-white">{averageRating}</p>
                       <div className="flex pb-1.5 text-yellow-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                       </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{reviewCount} avaliações</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Schedule */}
                <div className="xl:col-span-2 space-y-6">
                  <h2 className="text-xl font-bold text-slate-300">Agenda de Hoje</h2>
                  <div className="space-y-4">
                    {todaysAppointments.length === 0 ? (
                      <div className="p-8 text-center bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                        <p className="text-slate-500">Nenhum agendamento confirmado para hoje ainda.</p>
                      </div>
                    ) : (
                      todaysAppointments.map(booking => (
                        <div key={booking.id} className="bg-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-l-4 border-cyan-400 shadow-lg gap-4">
                          <div className="flex items-center gap-4">
                            <div className="text-center w-16">
                              <p className="text-xl font-bold text-white">{booking.time}</p>
                            </div>
                            <div>
                              <h3 className="text-white font-bold">{booking.customerName}</h3>
                              <p className="text-slate-400 text-sm">{booking.serviceName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                             <button
                               onClick={() => handleCompleteBooking(booking.id)}
                               className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-full transition-colors border border-emerald-500/20"
                               title="Concluir Atendimento"
                             >
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                             </button>
                             <button
                               onClick={() => { setEditingBooking(booking); setIsBookingModalOpen(true); }}
                               className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white"
                             >
                               Editar
                             </button>
                             <button 
                              onClick={() => {
                                 setBookings(prev => prev.map(b => b.id === booking.id ? {...b, status: 'cancelled'} : b));
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-full transition-colors"
                              title="Cancelar Agendamento"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="xl:col-span-1">
                  <h2 className="text-xl font-bold text-slate-300 mb-6">Atividade Semanal</h2>
                  <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                          cursor={{fill: '#334155'}}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 5 ? '#d946ef' : '#22d3ee'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="animate-fade-in-up">
              <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Gerenciar Serviços</h1>
                <button 
                  onClick={() => { setEditingService({}); setIsServiceModalOpen(true); }}
                  className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Adicionar Serviço
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {services.map(service => (
                   <div key={service.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 group">
                      <div className="h-40 overflow-hidden relative">
                         <img src={service.image} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                         <div className="absolute top-2 right-2 flex gap-2">
                            <button 
                              onClick={() => { setEditingService(service); setIsServiceModalOpen(true); }}
                              className="bg-slate-900/80 p-2 rounded-full text-cyan-400 hover:bg-cyan-400 hover:text-slate-900 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                            <button 
                              onClick={() => handleDeleteService(service.id)}
                              className="bg-slate-900/80 p-2 rounded-full text-red-400 hover:bg-red-400 hover:text-slate-900 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                         </div>
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-bold text-lg">{service.name}</h3>
                        <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">{service.description}</p>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-cyan-400 font-semibold">{service.durationMinutes} min</span>
                           <span className="text-fuchsia-400 font-bold text-lg">R$ {service.price}</span>
                        </div>
                      </div>
                   </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="animate-fade-in-up">
               <h1 className="text-3xl font-bold text-white mb-8">Avaliações dos Clientes</h1>
               {reviews.length === 0 ? (
                  <div className="text-slate-500 italic">Nenhuma avaliação recebida ainda.</div>
               ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {reviews.map(booking => (
                       <div key={booking.id} className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col md:flex-row gap-6">
                          <div className="flex-shrink-0 flex flex-col items-center justify-center bg-slate-900 rounded-lg p-4 w-32">
                             <span className="text-4xl font-black text-white">{booking.review?.rating}</span>
                             <div className="flex text-yellow-400 mt-1">
                                {[...Array(5)].map((_, i) => (
                                   <svg key={i} className={`w-3 h-3 ${i < (booking.review?.rating || 0) ? 'fill-current' : 'text-slate-700'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                ))}
                             </div>
                          </div>
                          <div className="flex-1">
                             <div className="flex justify-between items-start">
                                <div>
                                   <h3 className="text-white font-bold text-lg">{booking.customerName}</h3>
                                   <p className="text-cyan-400 text-sm font-semibold">{booking.serviceName}</p>
                                </div>
                                <span className="text-slate-500 text-sm">{new Date(booking.review?.date || '').toLocaleDateString('pt-BR')}</span>
                             </div>
                             <p className="text-slate-300 mt-3 italic">"{booking.review?.comment}"</p>
                          </div>
                       </div>
                    ))}
                  </div>
               )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="animate-fade-in-up max-w-2xl">
              <h1 className="text-3xl font-bold text-white mb-8">Configurações da Loja</h1>
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-6">
                <div>
                   <label className="text-slate-400 text-xs uppercase font-bold block mb-2">Nome da Barbearia</label>
                   <input 
                      value={shopSettings.name}
                      onChange={e => setShopSettings(prev => ({...prev, name: e.target.value}))}
                      className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-cyan-400 outline-none"
                   />
                </div>
                <div>
                   <label className="text-slate-400 text-xs uppercase font-bold block mb-2">Slogan</label>
                   <input 
                      value={shopSettings.tagline}
                      onChange={e => setShopSettings(prev => ({...prev, tagline: e.target.value}))}
                      className="w-full bg-slate-900 border border-slate-600 rounded p-3 text-white focus:border-cyan-400 outline-none"
                   />
                </div>
                <div className="pt-4 flex justify-end">
                   <button 
                     onClick={() => setNotification({message: "Configurações salvas!", isVisible: true})}
                     className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2 rounded-lg font-bold"
                   >
                     Salvar Alterações
                   </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  };

  return (
    <>
      <NotificationToast 
        message={notification.message} 
        isVisible={notification.isVisible} 
        onClose={() => setNotification(prev => ({ ...prev, isVisible: false }))} 
      />
      
      {renderServiceModal()}
      {renderBookingModal()}
      {renderReviewModal()}
      
      {currentRole === UserRole.NONE && renderLanding()}
      {currentRole === UserRole.CLIENT && renderClientView()}
      {currentRole === UserRole.BARBER && renderBarberDashboard()}
    </>
  );
};

export default App;