import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Users, 
  Receipt, 
  PieChart, 
  Share2, 
  Settings, 
  Trash2, 
  Camera,
  Home,
  AlertCircle,
  ArrowRight,
  UserPlus,
  Coins,
  History,
  X,
  LogOut,
  ChevronRight,
  Plus,
  Trash,
  Download,
  CheckCircle2,
  Circle
} from 'lucide-react';
import { TripGroup, Family, Expense, Role, SplitMethod } from './types';
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MY_TRIPS_KEY = 'expensytrip_my_trips';

const App: React.FC = () => {
  const [tripData, setTripData] = useState<TripGroup | null>(null);
  const [currentFamilyId, setCurrentFamilyId] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'dashboard' | 'expenses' | 'split' | 'settings'>('home');
  const [isCreating, setIsCreating] = useState(false);
  const [myTrips, setMyTrips] = useState<{id: string, k: string, name: string, date: string}[]>([]);

  // --- Backend (Netlify Functions + Neon) ---
  // Los datos ya NO se guardan en localStorage (salvo "Mis viajes" para tener un acceso rápido).
  // Se guardan en Neon a través de funciones serverless de Netlify.
  const apiUrl = (fn: string) => `${window.location.origin}/.netlify/functions/${fn}`;

  const addToMyTrips = (id: string, k: string, name: string) => {
    const newList = [{ id, k, name, date: new Date().toISOString() }, ...myTrips.filter(t => t.id !== id)];
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(newList));
    setMyTrips(newList);
  };

  const fetchJson = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const loadGroup = async (id: string, k: string) => {
    try {
      const data = await fetchJson(`${apiUrl('trip-get')}?id=${encodeURIComponent(id)}&k=${encodeURIComponent(k)}`);
      if (!data) throw new Error('Vacío');
      setTripData(data as TripGroup);

      // guardo en URL para que se pueda compartir
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      url.searchParams.set('k', k);
      window.history.replaceState({}, '', url.toString());

      const lastFamilyId = localStorage.getItem(`last_family_${id}`);
      if (lastFamilyId) setCurrentFamilyId(lastFamilyId);
      setView('dashboard');
      addToMyTrips(id, k, (data as any).name || id);
    } catch (e) {
      console.error(e);
      alert("Viaje no encontrado o clave incorrecta.");
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      url.searchParams.delete('k');
      window.history.replaceState({}, '', url.toString());
      setTripData(null);
      setCurrentFamilyId(null);
      setView('home');
    }
  };

  const saveGroup = async (data: TripGroup, k: string) => {
    await fetchJson(apiUrl('trip-save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.id, k, data })
    });
    setTripData({ ...data });
    addToMyTrips(data.id, k, data.name);
  };

  const exitTrip = () => {
    setTripData(null);
    setCurrentFamilyId(null);
    setView('home');
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('k');
    window.history.replaceState({}, '', url.toString());
  };

  // Nota: para borrar en BBDD necesitarías una función "trip-delete". De momento solo lo quita de "Mis viajes".
  const deleteTripFromMyList = (id: string) => {
    if (!confirm('¿Quieres quitar este viaje de "Mis viajes" en este dispositivo? (No borra la base de datos)')) return;
    const updatedMyTrips = myTrips.filter(t => t.id !== id);
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(updatedMyTrips));
    setMyTrips(updatedMyTrips);
    exitTrip();
  };

  const createGroup = async (name: string, adminFamilyName: string, members: number) => {
    if (!name || !adminFamilyName) return alert("Por favor rellena todos los campos");

    const groupId = uuidv4().substring(0, 8);
    const accessKey = Math.random().toString(36).slice(2, 10); // clave sencilla para compartir
    const adminId = uuidv4();

    const newGroup: TripGroup = {
      id: groupId,
      name,
      families: [
        { id: adminId, name: adminFamilyName, memberCount: members, role: Role.ADMIN }
      ],
      expenses: [],
      adminId: adminId,
      settledTransfers: []
    };

    // 1) crear en BBDD (tabla "trip_groups" con (id, access_key, data))
    await fetchJson(apiUrl('trip-create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: groupId, k: accessKey, group: { name, createdAt: new Date().toISOString() } })
    });

    // 2) guardar datos completos del viaje
    await saveGroup(newGroup, accessKey);

    setCurrentFamilyId(adminId);
    localStorage.setItem(`last_family_${groupId}`, adminId);
    setView('dashboard');
  };

  const joinGroup = async (groupId: string, accessKey: string, familyName: string, members: number) => {
    if (!groupId || !accessKey) return alert("Falta ID o clave");
    await loadGroup(groupId, accessKey);

    setTripData(prev => {
      if (!prev) return prev;
      const newFamilyId = uuidv4();
      const newFamily: Family = { id: newFamilyId, name: familyName, memberCount: members, role: Role.USER };
      const updated = { ...prev, families: [...prev.families, newFamily] };
      saveGroup(updated, accessKey).catch(console.error);
      setCurrentFamilyId(newFamilyId);
      localStorage.setItem(`last_family_${groupId}`, newFamilyId);
      setView('dashboard');
      return updated;
    });
  };

  const addFamilyToGroup = (name: string, members: number) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const newFamily: Family = { id: uuidv4(), name, memberCount: members, role: Role.USER };
    const updated = { ...tripData, families: [...tripData.families, newFamily] };
    saveGroup(updated, k).catch(console.error);
  };

  const addExpense = (concept: string, amount: number, familyId: string, imageUrl?: string) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const newExpense: Expense = {
      id: uuidv4(),
      concept,
      amount,
      familyId,
      date: new Date().toISOString(),
      imageUrl
    };
    const updated = { ...tripData, expenses: [...tripData.expenses, newExpense] };
    saveGroup(updated, k).catch(console.error);
  };

  const deleteExpense = (id: string) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const updated = { ...tripData, expenses: tripData.expenses.filter(e => e.id !== id) };
    saveGroup(updated, k).catch(console.error);
  };

  const updateRole = (familyId: string, newRole: Role) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const updatedFamilies = tripData.families.map(f => f.id === familyId ? { ...f, role: newRole } : f);
    saveGroup({ ...tripData, families: updatedFamilies }, k).catch(console.error);
  };

  const updateFamilyCount = (familyId: string, count: number) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const updatedFamilies = tripData.families.map(f => f.id === familyId ? { ...f, memberCount: count } : f);
    saveGroup({ ...tripData, families: updatedFamilies }, k).catch(console.error);
  };

  const toggleSettlement = (transferKey: string) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const settled = tripData.settledTransfers || [];
    const updatedSettled = settled.includes(transferKey) ? settled.filter(x => x !== transferKey) : [...settled, transferKey];
    saveGroup({ ...tripData, settledTransfers: updatedSettled }, k).catch(console.error);
  };

  useEffect(() => {
    const saved = localStorage.getItem(MY_TRIPS_KEY);
    if (saved) setMyTrips(JSON.parse(saved));

    // Si vienes con enlace compartido: ?id=XXXX&k=YYYY
    const sp = new URL(window.location.href).searchParams;
    const id = sp.get('id');
    const k = sp.get('k');
    if (id && k) {
      loadGroup(id, k);
    }
  }, []);

  if (!tripData && view === 'home') {
    return (
      <WelcomeScreen 
        myTrips={myTrips} 
        onSelectTrip={(id, k) => loadGroup(id, k)}
        onCreateTrip={() => setIsCreating(true)}
        onJoinTrip={() => { setIsCreating(false); setView('home'); }} 
        isCreating={isCreating} 
        createGroup={createGroup} 
        joinGroup={joinGroup} 
        onBack={() => setIsCreating(false)}
      />
    );
  }

  const currentFamily = tripData?.families.find(f => f.id === currentFamilyId) || tripData?.families[0];
  const isAdmin = currentFamily?.role === Role.ADMIN;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 font-sans antialiased text-slate-900">
      <Header tripName={tripData?.name || ''} groupId={tripData?.id || ''} onExit={exitTrip} />
      
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {view === 'dashboard' && <Dashboard tripData={tripData!} currentFamily={currentFamily!} />}
        {view === 'expenses' && <ExpensesView tripData={tripData!} onAddExpense={addExpense} onDeleteExpense={deleteExpense} currentFamilyId={currentFamily?.id || ''} />}
        {view === 'split' && <SplitView tripData={tripData!} onToggleSettlement={toggleSettlement} />}
        {view === 'settings' && (
          <SettingsView 
            tripData={tripData!} 
            isAdmin={isAdmin} 
            onUpdateRole={updateRole} 
            onUpdateCount={updateFamilyCount}
            onAddFamily={addFamilyToGroup}
            onDeleteTrip={() => deleteTripFromMyList(tripData!.id)}
            currentFamilyId={currentFamily?.id || ''}
          />
        )}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
};

const Header: React.FC<{ tripName: string; groupId: string; onExit: () => void }> = ({ tripName, groupId, onExit }) => {
  const [copied, setCopied] = useState(false);

  const shareLink = async () => {
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(groupId)}&k=${encodeURIComponent(k)}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert("No se pudo copiar el enlace. Copia manualmente: " + url);
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-2xl mx-auto p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
            <Coins size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">{tripName}</h1>
            <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
              ID: <span className="font-mono text-slate-500">{groupId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={shareLink} 
            className={`p-3 rounded-2xl border transition-all ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Copiar enlace"
          >
            <Share2 size={18} />
          </button>

          <button 
            onClick={onExit}
            className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Salir"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

const BottomNav: React.FC<{ view: string; setView: (v: any) => void }> = ({ view, setView }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 shadow-2xl shadow-slate-200/30">
    <div className="max-w-2xl mx-auto px-6 py-4 flex justify-between">
      <NavButton active={view === 'dashboard'} icon={<Home size={22} />} label="Inicio" onClick={() => setView('dashboard')} />
      <NavButton active={view === 'expenses'} icon={<Receipt size={22} />} label="Gastos" onClick={() => setView('expenses')} />
      <NavButton active={view === 'split'} icon={<PieChart size={22} />} label="Reparto" onClick={() => setView('split')} />
      <NavButton active={view === 'settings'} icon={<Settings size={22} />} label="Grupo" onClick={() => setView('settings')} />
    </div>
  </nav>
);

const WelcomeScreen: React.FC<{
  myTrips: {id: string, k: string, name: string, date: string}[];
  onSelectTrip: (id: string, k: string) => void;
  onCreateTrip: () => void;
  onJoinTrip: () => void;
  isCreating: boolean;
  createGroup: (name: string, family: string, members: number) => void;
  joinGroup: (id: string, k: string, family: string, members: number) => void;
  onBack: () => void;
}> = ({ myTrips, onSelectTrip, isCreating, createGroup, joinGroup, onBack }) => {
  const [formData, setFormData] = useState({ name: '', family: '', members: 1, gId: '', k: '' });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="w-20 h-20 bg-indigo-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl shadow-indigo-200">
            <Coins size={36} className="text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Gastos Viaje</h1>
          <p className="text-slate-400 font-bold">Comparte y reparte sin líos.</p>
        </div>

        {!isCreating && (
          <div className="space-y-4">
            <button 
              onClick={() => { setFormData({ name: '', family: '', members: 1, gId: '', k: '' }); (window as any).__setCreating?.(true); }}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.75rem] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle size={20} /> Crear nuevo viaje
            </button>

            <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                Mis viajes
              </h2>
              {myTrips.length === 0 ? (
                <p className="text-slate-400 text-sm font-bold">Aún no tienes viajes guardados.</p>
              ) : (
                <div className="space-y-3">
                  {myTrips.map(trip => (
                    <button 
                      key={trip.id}
                      onClick={() => onSelectTrip(trip.id, trip.k)}
                      className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl p-4 transition-all"
                    >
                      <div className="text-left">
                        <p className="font-black text-slate-900 leading-none">{trip.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">ID: {trip.id}</p>
                      </div>
                      <ChevronRight className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <UserPlus size={18} className="text-emerald-600" />
                Unirse a un viaje
              </h2>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">ID del Grupo</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="ID de 8 caracteres..." value={formData.gId} onChange={e => setFormData({...formData, gId: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Clave (k)</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="Clave que te han pasado..." value={formData.k} onChange={e => setFormData({...formData, k: e.target.value})} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre de tu familia</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="Ej: López García" value={formData.family} onChange={e => setFormData({...formData, family: e.target.value})} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Miembros</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" value={formData.members} onChange={e => setFormData({...formData, members: parseInt(e.target.value || '1', 10)})} />
                </div>

                <button onClick={() => joinGroup(formData.gId, formData.k, formData.family, formData.members)} className="w-full bg-emerald-600 text-white font-bold py-5 rounded-[1.25rem] shadow-xl hover:bg-emerald-700 transition-all mt-4">Unirse ahora</button>
              </div>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 relative space-y-6">
            <button onClick={onBack} className="absolute top-6 right-6 text-slate-300 hover:text-slate-700"><X size={22} /></button>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Crear nuevo viaje</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre del viaje</label>
                <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Ej: Alcalá del Júcar" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Tu familia (admin)</label>
                <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Ej: Rodelgo Panadero" value={formData.family} onChange={e => setFormData({...formData, family: e.target.value})} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Miembros</label>
                <input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50" value={formData.members} onChange={e => setFormData({...formData, members: parseInt(e.target.value || '1', 10)})} />
              </div>

              <button onClick={() => createGroup(formData.name, formData.family, formData.members)} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.75rem] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Crear</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ tripData: TripGroup; currentFamily: Family }> = ({ tripData, currentFamily }) => {
  const total = tripData.expenses.reduce((sum, e) => sum + e.amount, 0);
  const myPaid = tripData.expenses.filter(e => e.familyId === currentFamily.id).reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <h2 className="text-3xl font-black text-slate-900 tracking-tight">Resumen</h2>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Gastado</p>
          <p className="text-4xl font-black text-slate-900 mt-2">{total.toFixed(2)}€</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Has Pagado</p>
          <p className="text-3xl font-black text-indigo-600 mt-2">{myPaid.toFixed(2)}€</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Users size={18} className="text-indigo-600" />
          Familias
        </h3>
        <div className="space-y-3">
          {tripData.families.map(f => (
            <div key={f.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <div>
                <p className="font-black text-slate-900 leading-none">{f.name}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{f.memberCount} miembros · {f.role}</p>
              </div>
              <div className="font-black text-slate-700">
                {tripData.expenses.filter(e => e.familyId === f.id).reduce((sum, e) => sum + e.amount, 0).toFixed(2)}€
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ExpensesView: React.FC<{ tripData: TripGroup; onAddExpense: (concept: string, amount: number, familyId: string, imageUrl?: string) => void; onDeleteExpense: (id: string) => void; currentFamilyId: string; }> = ({ tripData, onAddExpense, onDeleteExpense, currentFamilyId }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(currentFamilyId || tripData.families[0]?.id);
  const [image, setImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    setPayerId(currentFamilyId || tripData.families[0]?.id);
  }, [currentFamilyId, tripData.families]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAdd = () => {
    const num = parseFloat(amount);
    if (!concept || isNaN(num) || num <= 0) return alert("Introduce concepto e importe válido");
    onAddExpense(concept, num, payerId!, image);
    setConcept('');
    setAmount('');
    setImage(undefined);
    setShowAdd(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gastos</h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 text-white flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:scale-105 transition-all"
          >
            <PlusCircle size={18} />
            <span>Nuevo</span>
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl relative animate-in zoom-in-95 duration-200">
          <button onClick={() => setShowAdd(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-600"><X size={24} /></button>
          <h3 className="text-xl font-black text-slate-900 mb-6">¿Qué habéis comprado?</h3>
          <div className="space-y-5">
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Concepto</label><input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Ej: Cena, Gasolina..." value={concept} onChange={e => setConcept(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Importe (€)</label><input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pagador</label><select className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50 font-bold appearance-none cursor-pointer" value={payerId} onChange={e => setPayerId(e.target.value)}>{tripData.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            </div>
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Foto Ticket</label><input type="file" id="ticket-photo" className="hidden" accept="image/*" onChange={handleFile} /><label htmlFor="ticket-photo" className="block w-full border-2 border-dashed border-slate-200 rounded-[1.5rem] py-8 text-center cursor-pointer hover:bg-slate-50">{image ? (<div className="flex items-center justify-center gap-4 px-6"><img src={image} className="w-16 h-16 object-cover rounded-xl shadow-lg" /><span className="text-xs font-bold text-emerald-600">¡Imagen lista!</span></div>) : (<div className="flex flex-col items-center gap-2"><Camera className="text-slate-300" size={32} /><span className="text-xs text-slate-400 font-bold">Subir foto</span></div>)}</label></div>
            <button onClick={handleAdd} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Guardar Gasto</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tripData.expenses.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center"><div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6"><History size={40} /></div><p className="text-slate-400 font-bold tracking-tight">Sin gastos todavía.</p></div>
        ) : (
          tripData.expenses.slice().reverse().map(e => {
            const family = tripData.families.find(f => f.id === e.familyId);
            return (
              <div key={e.id} className="bg-white p-5 rounded-[1.75rem] border border-slate-100 flex justify-between items-center group shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-4">{e.imageUrl ? <img src={e.imageUrl} className="w-14 h-14 rounded-2xl object-cover border border-slate-100" /> : <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300"><Receipt size={24} /></div>}<div><h4 className="font-black text-slate-900 tracking-tight leading-none mb-1">{e.concept}</h4><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Familia {family?.name}</p><p className="text-[10px] text-indigo-500 font-bold mt-0.5">{new Date(e.date).toLocaleDateString()}</p></div></div>
                <div className="flex items-center gap-3"><div className="text-right"><p className="text-xl font-black text-slate-900">{e.amount.toFixed(2)}€</p></div><button onClick={() => { if(confirm('¿Eliminar?')) onDeleteExpense(e.id); }} className="p-2.5 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const SplitView: React.FC<{ tripData: TripGroup; onToggleSettlement: (key: string) => void }> = ({ tripData, onToggleSettlement }) => {
  const [method, setMethod] = useState<SplitMethod>('BY_MEMBER');
  const totalSpent = tripData.expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalMembers = tripData.families.reduce((sum, f) => sum + f.memberCount, 0);

  const familiesSettlement = tripData.families.map(f => {
    const paid = tripData.expenses.filter(e => e.familyId === f.id).reduce((sum, e) => sum + e.amount, 0);
    const share = method === 'BY_MEMBER' ? (totalSpent / (totalMembers || 1)) * f.memberCount : totalSpent / (tripData.families.length || 1);
    return { id: f.id, name: f.name, paid, share, balance: paid - share };
  });

  const calculateTransfers = () => {
    const debtors = familiesSettlement.filter(f => f.balance < -0.01).map(f => ({...f, id: f.id, name: f.name, balance: Math.abs(f.balance)}));
    const creditors = familiesSettlement.filter(f => f.balance > 0.01);
    const transfers: Array<{ from: string; fromId: string; to: string; toId: string; amount: number }> = [];
    let d = 0, c = 0;
    while(d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].balance, creditors[c].balance);
      transfers.push({ from: debtors[d].name, fromId: debtors[d].id, to: creditors[c].name, toId: creditors[c].id, amount });
      debtors[d].balance -= amount; creditors[c].balance -= amount;
      if (debtors[d].balance < 0.01) d++;
      if (creditors[c].balance < 0.01) c++;
    }
    return transfers;
  };

  const settled = tripData.settledTransfers || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      <h2 className="text-3xl font-black text-slate-900 tracking-tight">Reparto</h2>
      <div className="bg-white p-2 rounded-3xl border border-slate-100 flex shadow-sm">
        <button onClick={() => setMethod('BY_MEMBER')} className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${method === 'BY_MEMBER' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400'}`}>Por Miembros</button>
        <button onClick={() => setMethod('BY_PERCENTAGE')} className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${method === 'BY_PERCENTAGE' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400'}`}>Igual por Familia</button>
      </div>
      <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden text-white">
        <p className="text-indigo-300 text-[10px] font-black uppercase tracking-widest mb-2">Cuota media</p>
        <p className="text-4xl font-black">{(totalSpent / (totalMembers || 1)).toFixed(2)}€</p>
      </div>
      <section className="space-y-3">
        {familiesSettlement.map(f => (
          <div key={f.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm"><div className="flex flex-col"><h4 className="font-bold text-slate-900 leading-none">{f.name}</h4><span className="text-[9px] text-slate-400 font-bold uppercase mt-1">CUOTA: {f.share.toFixed(2)}€</span></div><div className={`text-lg font-black ${f.balance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{f.balance >= 0 ? '+' : ''}{f.balance.toFixed(2)}€</div></div>
        ))}
      </section>
      <section className="bg-emerald-50 rounded-[2rem] p-6 space-y-4">
        <h3 className="text-sm font-black text-emerald-900 uppercase tracking-widest px-1">¿Quién ha pagado a quién?</h3>
        {calculateTransfers().map((t, i) => {
          const transferKey = `${t.fromId}-${t.toId}-${t.amount.toFixed(2)}`;
          const isSettled = settled.includes(transferKey);
          return (
            <div key={i} className={`flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border ${isSettled ? 'border-emerald-200 opacity-60' : 'border-transparent'}`}>
              <div className="flex items-center gap-3 flex-1">
                <button 
                  onClick={() => onToggleSettlement(transferKey)}
                  className={`transition-colors ${isSettled ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-400'}`}
                >
                  {isSettled ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                </button>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Paga</span>
                  <span className={`font-bold ${isSettled ? 'line-through' : ''}`}>{t.from}</span>
                </div>
              </div>
              <div className="flex flex-col items-center px-4">
                <ArrowRight size={14} className="text-emerald-400" />
                <span className="text-xs font-black text-emerald-700">{t.amount.toFixed(2)}€</span>
              </div>
              <div className="flex-1 text-right">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">A</span>
                <p className={`font-bold ${isSettled ? 'line-through' : ''}`}>{t.to}</p>
              </div>
            </div>
          );
        })}
        {calculateTransfers().length === 0 && <p className="text-center text-emerald-800 font-bold text-xs">¡Todo saldado!</p>}
      </section>
    </div>
  );
};

const SettingsView: React.FC<{ 
  tripData: TripGroup; 
  isAdmin: boolean; 
  onUpdateRole: (fid: string, r: Role) => void;
  onUpdateCount: (fid: string, c: number) => void;
  onAddFamily: (name: string, members: number) => void;
  onDeleteTrip: () => void;
  currentFamilyId: string;
}> = ({ tripData, isAdmin, onUpdateRole, onUpdateCount, onAddFamily, onDeleteTrip, currentFamilyId }) => {
  const [newFamily, setNewFamily] = useState({ name: '', members: 1 });
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center"><h2 className="text-3xl font-black text-slate-900 tracking-tight">Grupo</h2>{isAdmin && (<button onClick={() => setShowAdd(!showAdd)} className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100"><Plus size={24} /></button>)}</div>
      {showAdd && isAdmin && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-indigo-100 shadow-xl space-y-4 animate-in zoom-in-95 duration-200">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nueva Familia</h3>
          <input className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none" placeholder="Apellido..." value={newFamily.name} onChange={e => setNewFamily({...newFamily, name: e.target.value})} />
          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl"><span className="text-xs font-bold text-slate-500 ml-2">Miembros</span><div className="flex items-center gap-3"><button onClick={() => setNewFamily({...newFamily, members: Math.max(1, newFamily.members - 1)})} className="w-10 h-10 rounded-lg bg-white border border-slate-200 font-bold">-</button><span className="font-black">{newFamily.members}</span><button onClick={() => setNewFamily({...newFamily, members: newFamily.members + 1})} className="w-10 h-10 rounded-lg bg-white border border-slate-200 font-bold">+</button></div></div>
          <button onClick={() => { if(newFamily.name) { onAddFamily(newFamily.name, newFamily.members); setNewFamily({name:'', members:1}); setShowAdd(false); }}} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl">Registrar</button>
        </div>
      )}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
        <div className="p-6"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Miembros</h3></div>
        {tripData.families.map(f => (
          <div key={f.id} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${f.id === currentFamilyId ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>{f.name.charAt(0).toUpperCase()}</div><div><h4 className="font-black text-slate-800 leading-none mb-1">{f.name}</h4><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{f.role}</p></div></div>
              {isAdmin && f.id !== tripData.adminId ? (<select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none" value={f.role} onChange={e => onUpdateRole(f.id, e.target.value as Role)}><option value={Role.USER}>Usuario</option><option value={Role.ADMIN}>Admin</option></select>) : <span className="text-[10px] font-black tracking-widest uppercase bg-slate-50 px-3 py-1.5 rounded-lg text-slate-400">Lock</span>}
            </div>
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Miembros:</span>
              <div className="flex items-center gap-4">
                <button disabled={!isAdmin && f.id !== currentFamilyId} onClick={() => onUpdateCount(f.id, Math.max(1, f.memberCount - 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500">-</button>
                <span className="font-black text-lg w-4 text-center">{f.memberCount}</span>
                <button disabled={!isAdmin && f.id !== currentFamilyId} onClick={() => onUpdateCount(f.id, f.memberCount + 1)} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500">+</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-2xl flex items-center justify-between"><div className="space-y-1"><h4 className="text-xl font-black tracking-tight">ID</h4><p className="text-xs text-indigo-200 font-bold">Para invitar.</p></div><div className="bg-white/20 backdrop-blur-md px-5 py-3 rounded-2xl font-mono font-black text-2xl tracking-widest">{tripData.id}</div></div>
      {isAdmin && (<div className="pt-6"><button onClick={onDeleteTrip} className="w-full flex items-center justify-center gap-2 bg-rose-50 text-rose-600 font-black py-5 rounded-[2rem] border border-rose-100 hover:bg-rose-100"><Trash size={20} /><span>ELIMINAR VIAJE</span></button></div>)}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all group ${active ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}><div className={`p-2 rounded-2xl transition-colors ${active ? 'bg-indigo-50 shadow-inner' : 'group-hover:bg-slate-50'}`}>{icon}</div><span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span></button>
);

export default App;
