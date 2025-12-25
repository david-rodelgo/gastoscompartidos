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

type MyTrip = { id: string; k: string; name: string; date: string };

const App: React.FC = () => {
  const [tripData, setTripData] = useState<TripGroup | null>(null);
  const [currentFamilyId, setCurrentFamilyId] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'dashboard' | 'expenses' | 'split' | 'settings'>('home');
  const [isCreating, setIsCreating] = useState(false);
  const [myTrips, setMyTrips] = useState<MyTrip[]>([]);

  // --- Backend (Netlify Functions + Neon) ---
  // Se guarda en Neon mediante funciones serverless.
  // En localStorage solo guardamos "Mis viajes" (lista) y "last_family".
  const apiUrl = (fn: string) => `${window.location.origin}/.netlify/functions/${fn}`;

  const fetchJson = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const addToMyTrips = (id: string, k: string, name: string) => {
    const newList: MyTrip[] = [{ id, k, name, date: new Date().toISOString() }, ...myTrips.filter(t => t.id !== id)];
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(newList));
    setMyTrips(newList);
  };

  const setUrlParams = (id: string, k: string) => {
    const url = new URL(window.location.href);
    url.hash = ''; // dejamos de usar hash para evitar confusiones
    url.searchParams.set('id', id);
    url.searchParams.set('k', k);
    window.history.replaceState({}, '', url.toString());
  };

  const clearUrlParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('k');
    url.hash = '';
    window.history.replaceState({}, '', url.toString());
  };

  const loadGroup = async (id: string, k: string) => {
    try {
      const data = await fetchJson(`${apiUrl('trip-get')}?id=${encodeURIComponent(id)}&k=${encodeURIComponent(k)}`);
      if (!data) throw new Error('Vacío');

      setTripData(data as TripGroup);
      setUrlParams(id, k);

      const lastFamilyId = localStorage.getItem(`last_family_${id}`);
      if (lastFamilyId) setCurrentFamilyId(lastFamilyId);

      setView('dashboard');
      addToMyTrips(id, k, (data as any).name || id);
    } catch (e) {
      console.error(e);
      alert('Viaje no encontrado o clave incorrecta.');
      clearUrlParams();
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
    clearUrlParams();
  };

  // Nota: sin función "trip-delete" no borra en BBDD. Solo quita el acceso rápido en este dispositivo.
  const deleteTripFromMyList = (id: string) => {
    if (!confirm('¿Quieres quitar este viaje de "Mis viajes" en este dispositivo? (No borra la base de datos)')) return;
    const updated = myTrips.filter(t => t.id !== id);
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(updated));
    setMyTrips(updated);
    exitTrip();
  };

  const createGroup = async (name: string, adminFamilyName: string, members: number) => {
    if (!name || !adminFamilyName) return alert('Por favor rellena todos los campos');

    const groupId = uuidv4().substring(0, 8);
    const accessKey = Math.random().toString(36).slice(2, 10);
    const adminId = uuidv4();

    const newGroup: TripGroup = {
      id: groupId,
      name,
      families: [{ id: adminId, name: adminFamilyName, memberCount: members, role: Role.ADMIN }],
      expenses: [],
      adminId: adminId,
      settledTransfers: []
    };

    // 1) Crear “registro base” (id + k) en la tabla
    await fetchJson(apiUrl('trip-create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: groupId, k: accessKey, group: { name, createdAt: new Date().toISOString() } })
    });

    // 2) Guardar JSON completo del viaje
    await saveGroup(newGroup, accessKey);

    setCurrentFamilyId(adminId);
    localStorage.setItem(`last_family_${groupId}`, adminId);
    setView('dashboard');
    setUrlParams(groupId, accessKey);
  };

  const joinGroup = async (groupId: string, accessKey: string, familyName: string, members: number) => {
    if (!groupId || !accessKey) return alert('Falta ID o clave');
    if (!familyName) return alert('Falta el nombre de tu familia');

    await loadGroup(groupId, accessKey);

    setTripData(prev => {
      if (!prev) return prev;

      // Evitar duplicar familia si el usuario recarga / pulsa dos veces
      const already = prev.families.some(f => f.name.trim().toLowerCase() === familyName.trim().toLowerCase());
      const newFamilyId = uuidv4();
      const newFamily: Family = { id: newFamilyId, name: familyName, memberCount: members, role: Role.USER };

      const updated = already ? prev : { ...prev, families: [...prev.families, newFamily] };

      saveGroup(updated, accessKey).catch(console.error);

      const familyToSelect = already
        ? (prev.families.find(f => f.name.trim().toLowerCase() === familyName.trim().toLowerCase())?.id || prev.families[0]?.id)
        : newFamilyId;

      if (familyToSelect) {
        setCurrentFamilyId(familyToSelect);
        localStorage.setItem(`last_family_${groupId}`, familyToSelect);
      }

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
    const updatedFamilies = tripData.families.map(f => (f.id === familyId ? { ...f, role: newRole } : f));
    saveGroup({ ...tripData, families: updatedFamilies }, k).catch(console.error);
  };

  const updateFamilyCount = (familyId: string, count: number) => {
    if (!tripData) return;
    const k = new URL(window.location.href).searchParams.get('k') || '';
    const updatedFamilies = tripData.families.map(f => (f.id === familyId ? { ...f, memberCount: count } : f));
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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMyTrips(parsed);
      } catch {}
    }

    // Soporta enlaces compartidos nuevos: ?id=XXXX&k=YYYY
    const sp = new URL(window.location.href).searchParams;
    const id = sp.get('id');
    const k = sp.get('k');
    if (id && k) {
      loadGroup(id, k);
      return;
    }

    // Compatibilidad mínima con enlaces antiguos #group_XXXX:
    // Si existe en "Mis viajes", intentamos cargarlo usando la k guardada.
    const hash = window.location.hash.replace('#', '');
    if (hash && hash.startsWith('group_')) {
      const gId = hash.replace('group_', '');
      const found = (saved ? (() => { try { return JSON.parse(saved) as MyTrip[]; } catch { return []; } })() : []).find(t => t.id === gId);
      if (found?.k) {
        loadGroup(found.id, found.k);
      } else {
        // no rompemos UI, solo limpiamos hash
        window.location.hash = '';
      }
    }
  }, []);

  if (!tripData && view === 'home') {
    return (
      <WelcomeScreen
        myTrips={myTrips}
        onSelectTrip={(id, k) => loadGroup(id, k)}
        onCreateTrip={() => setIsCreating(true)}
        onJoinTrip={() => {
          setIsCreating(false);
          setView('home');
        }}
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
        {view === 'expenses' && (
          <ExpensesView
            tripData={tripData!}
            onAddExpense={addExpense}
            onDeleteExpense={deleteExpense}
            currentFamilyId={currentFamily?.id || ''}
          />
        )}
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

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex justify-between items-center shadow-xl z-50 rounded-t-3xl md:max-w-2xl md:mx-auto">
        <NavButton active={view === 'dashboard'} icon={<Home size={22} />} label="Inicio" onClick={() => setView('dashboard')} />
        <NavButton active={view === 'expenses'} icon={<Receipt size={22} />} label="Gastos" onClick={() => setView('expenses')} />
        <NavButton active={view === 'split'} icon={<PieChart size={22} />} label="Reparto" onClick={() => setView('split')} />
        <NavButton active={view === 'settings'} icon={<Settings size={22} />} label="Ajustes" onClick={() => setView('settings')} />
      </nav>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const Header: React.FC<{ tripName: string; groupId: string; onExit: () => void }> = ({ tripName, groupId, onExit }) => {
  const shareLink = async () => {
    const sp = new URL(window.location.href).searchParams;
    const k = sp.get('k') || '';
    const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(groupId)}&k=${encodeURIComponent(k)}`;

    try {
      await navigator.clipboard.writeText(url);
      alert('Enlace copiado. ¡Envíalo a los demás miembros!');
    } catch {
      alert('No se pudo copiar. Copia manualmente: ' + url);
    }
  };

  return (
    <header className="bg-white/70 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-40 md:max-w-2xl md:mx-auto w-full">
      <div className="flex items-center gap-3">
        <button
          onClick={onExit}
          title="Salir al menú principal"
          className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <LogOut size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">{tripName}</h1>
          <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">ID: {groupId}</p>
        </div>
      </div>
      <button
        onClick={shareLink}
        className="bg-indigo-50 text-indigo-600 p-2.5 rounded-2xl hover:bg-indigo-100 transition-all flex items-center gap-2 group"
      >
        <Share2 size={18} className="group-hover:scale-110 transition-transform" />
        <span className="text-sm font-bold hidden sm:inline">Invitar</span>
      </button>
    </header>
  );
};

const WelcomeScreen: React.FC<{
  myTrips: { id: string; k: string; name: string; date: string }[];
  onSelectTrip: (id: string, k: string) => void;
  onCreateTrip: () => void;
  onJoinTrip: () => void;
  isCreating: boolean;
  createGroup: (name: string, family: string, members: number) => void;
  joinGroup: (id: string, k: string, family: string, members: number) => void;
  onBack: () => void;
}> = ({ myTrips, onSelectTrip, isCreating, createGroup, joinGroup }) => {
  const [formData, setFormData] = useState({ name: '', family: '', members: 1, gId: '', k: '' });
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');

  useEffect(() => {
    if (isCreating) setMode('create');
  }, [isCreating]);

  if (mode === 'list') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full relative overflow-hidden">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-600 text-white mb-6 shadow-2xl shadow-indigo-200">
              <Coins size={40} />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Mis Viajes</h2>
            <p className="text-slate-500 mt-2 font-medium">Gestiona tus gastos compartidos.</p>
          </div>

          <div className="space-y-3 mb-8 max-h-64 overflow-y-auto pr-1">
            {myTrips.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">No tienes viajes aún</p>
              </div>
            ) : (
              myTrips.map(trip => (
                <button
                  key={trip.id}
                  onClick={() => onSelectTrip(trip.id, trip.k)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-lg transition-all group"
                >
                  <div className="text-left">
                    <p className="font-black text-slate-800 leading-none mb-1">{trip.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(trip.date).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setFormData({ name: '', family: '', members: 1, gId: '', k: '' });
                setMode('create');
              }}
              className="flex flex-col items-center justify-center p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all gap-2"
            >
              <PlusCircle size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Crear</span>
            </button>
            <button
              onClick={() => {
                setFormData({ name: '', family: '', members: 1, gId: '', k: '' });
                setMode('join');
              }}
              className="flex flex-col items-center justify-center p-4 bg-emerald-600 text-white rounded-[1.5rem] shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all gap-2"
            >
              <UserPlus size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Unirse</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-md w-full relative">
        <button onClick={() => setMode('list')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-600">
          <ArrowRight size={24} className="rotate-180" />
        </button>
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">{mode === 'create' ? 'Nuevo Viaje' : 'Unirse a Viaje'}</h2>
          <p className="text-slate-500 mt-2 font-medium">{mode === 'create' ? 'Configura tu grupo' : 'Introduce el ID y la clave (k) del grupo'}</p>
        </div>
        <div className="space-y-5">
          {mode === 'create' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre del Viaje</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-indigo-50 outline-none"
                  placeholder="Ej: Verano en la Costa"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Tu Familia</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-indigo-50 outline-none"
                  placeholder="Ej: Los García"
                  value={formData.family}
                  onChange={e => setFormData({ ...formData, family: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Número de Personas</label>
                <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-2">
                  <button
                    onClick={() => setFormData({ ...formData, members: Math.max(1, formData.members - 1) })}
                    className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-lg">{formData.members}</span>
                  <button
                    onClick={() => setFormData({ ...formData, members: formData.members + 1 })}
                    className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                onClick={() => createGroup(formData.name, formData.family, formData.members)}
                className="w-full bg-indigo-600 text-white font-bold py-5 rounded-[1.25rem] shadow-xl hover:bg-indigo-700 transition-all mt-4"
              >
                Comenzar Viaje
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">ID del Grupo</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none"
                  placeholder="ID de 8 caracteres..."
                  value={formData.gId}
                  onChange={e => setFormData({ ...formData, gId: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Clave (k)</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none"
                  placeholder="Clave que te han pasado..."
                  value={formData.k}
                  onChange={e => setFormData({ ...formData, k: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre de tu Familia</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none"
                  placeholder="Ej: Los Pérez"
                  value={formData.family}
                  onChange={e => setFormData({ ...formData, family: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Personas</label>
                <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-2">
                  <button
                    onClick={() => setFormData({ ...formData, members: Math.max(1, formData.members - 1) })}
                    className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-emerald-600"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-lg">{formData.members}</span>
                  <button
                    onClick={() => setFormData({ ...formData, members: formData.members + 1 })}
                    className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-emerald-600"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                onClick={() => joinGroup(formData.gId, formData.k, formData.family, formData.members)}
                className="w-full bg-emerald-600 text-white font-bold py-5 rounded-[1.25rem] shadow-xl hover:bg-emerald-700 transition-all mt-4"
              >
                Unirse ahora
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- El resto de componentes (Dashboard, ExpensesView, SplitView, SettingsView, NavButton) ---
// Son idénticos a tu versión original (no hay que tocar UI).
// Pega aquí exactamente tus componentes tal y como los tienes, sin cambios.

// ---------------
// IMPORTANTÍSIMO:
// En tu pegado original de antes, todo esto ya está y no hace falta tocarlo.
// ---------------

const Dashboard: React.FC<{ tripData: TripGroup; currentFamily: Family }> = ({ tripData, currentFamily }) => {
  const totalSpent = tripData.expenses.reduce((sum, e) => sum + e.amount, 0);
  const familySpent = tripData.expenses.filter(e => e.familyId === currentFamily.id).reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Coins size={120} /></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Gasto Total</p>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-5xl font-black text-slate-900">{totalSpent.toFixed(2)}</p>
            <span className="text-2xl font-bold text-slate-400">€</span>
          </div>
          <div className="flex items-center gap-2 mt-6 text-indigo-600 bg-indigo-50 w-fit px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider">
            <Receipt size={14} />
            <span>{tripData.expenses.length} Transacciones</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-[2rem] shadow-2xl shadow-indigo-100 text-white relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Has pagado (Familia {currentFamily.name})</p>
            <div className="flex items-baseline gap-1 mt-1"><p className="text-4xl font-black">{familySpent.toFixed(2)}</p><span className="text-xl font-bold text-indigo-200">€</span></div>
            <div className="flex items-center gap-2 mt-6 bg-white/20 w-fit px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider"><Users size={14} /><span>{currentFamily.memberCount} Miembros registrados</span></div>
          </div>
        </div>
      </div>
      <section>
        <div className="flex items-center justify-between mb-4 px-2"><h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Familias Integrantes</h3><span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-lg font-bold">{tripData.families.length}</span></div>
        <div className="grid grid-cols-1 gap-3">
          {tripData.families.map(f => (
            <div key={f.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black ${f.id === currentFamily.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-400'}`}>{f.name.substring(0,2).toUpperCase()}</div><div><p className="font-bold text-slate-800">{f.name} {f.id === currentFamily.id && <span className="ml-1 text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md">YO</span>}</p><p className="text-xs text-slate-400 font-bold">{f.memberCount} pers.</p></div></div>
              <div className="flex flex-col items-end gap-1"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase ${f.role === Role.ADMIN ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>{f.role}</span><p className="text-xs font-bold text-slate-700">{tripData.expenses.filter(e => e.familyId === f.id).reduce((s, e) => s + e.amount, 0).toFixed(0)}€ pagados</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const ExpensesView: React.FC<{
  tripData: TripGroup;
  onAddExpense: (c: string, a: number, fid: string, img?: string) => void;
  onDeleteExpense: (id: string) => void;
  currentFamilyId: string;
}> = ({ tripData, onAddExpense, onDeleteExpense, currentFamilyId }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(currentFamilyId);
  const [image, setImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (currentFamilyId) setPayerId(currentFamilyId);
  }, [currentFamilyId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAdd = () => {
    if (!concept || !amount) return;
    onAddExpense(concept, parseFloat(amount), payerId, image);
    setConcept('');
    setAmount('');
    setImage(undefined);
    setShowAdd(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Gastos del Viaje: ${tripData.name}`, 14, 22);
    doc.setFontSize(10);
    doc.text(`ID del Grupo: ${tripData.id} | Fecha: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = tripData.expenses.slice().reverse().map(e => {
      const family = tripData.families.find(f => f.id === e.familyId);
      return [new Date(e.date).toLocaleDateString(), e.concept, family?.name || '?', `${e.amount.toFixed(2)}€`];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Fecha', 'Concepto', 'Familia', 'Importe']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.text(`Gasto Total: ${tripData.expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}€`, 14, finalY + 10);

    doc.save(`Gastos_${tripData.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gastos</h2>
        <div className="flex gap-2">
          <button onClick={exportToPDF} className="bg-slate-100 text-slate-600 p-3 rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center" title="Exportar a PDF">
            <Download size={18} />
          </button>
          <button onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:scale-105 transition-all">
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
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Concepto</label>
              <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Ej: Cena, Gasolina..." value={concept} onChange={e => setConcept(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Importe (€)</label>
                <input type="number" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pagador</label>
                <select className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-indigo-50 font-bold appearance-none cursor-pointer" value={payerId} onChange={e => setPayerId(e.target.value)}>
                  {tripData.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Foto Ticket</label>
              <input type="file" id="ticket-photo" className="hidden" accept="image/*" onChange={handleFile} />
              <label htmlFor="ticket-photo" className="block w-full border-2 border-dashed border-slate-200 rounded-[1.5rem] py-8 text-center cursor-pointer hover:bg-slate-50">
                {image ? (
                  <div className="flex items-center justify-center gap-4 px-6">
                    <img src={image} className="w-16 h-16 object-cover rounded-xl shadow-lg" />
                    <span className="text-xs font-bold text-emerald-600">¡Imagen lista!</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="text-slate-300" size={32} />
                    <span className="text-xs text-slate-400 font-bold">Subir foto</span>
                  </div>
                )}
              </label>
            </div>
            <button onClick={handleAdd} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Guardar Gasto</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tripData.expenses.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6"><History size={40} /></div>
            <p className="text-slate-400 font-bold tracking-tight">Sin gastos todavía.</p>
          </div>
        ) : (
          tripData.expenses.slice().reverse().map(e => {
            const family = tripData.families.find(f => f.id === e.familyId);
            return (
              <div key={e.id} className="bg-white p-5 rounded-[1.75rem] border border-slate-100 flex justify-between items-center group shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  {e.imageUrl ? (
                    <img src={e.imageUrl} className="w-14 h-14 rounded-2xl object-cover border border-slate-100" />
                  ) : (
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300"><Receipt size={24} /></div>
                  )}
                  <div>
                    <h4 className="font-black text-slate-900 tracking-tight leading-none mb-1">{e.concept}</h4>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Familia {family?.name}</p>
                    <p className="text-[10px] text-indigo-500 font-bold mt-0.5">{new Date(e.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xl font-black text-slate-900">{e.amount.toFixed(2)}€</p>
                  </div>
                  <button onClick={() => { if (confirm('¿Eliminar?')) onDeleteExpense(e.id); }} className="p-2.5 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                    <Trash2 size={18} />
                  </button>
                </div>
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
    const share = method === 'BY_MEMBER'
      ? (totalSpent / (totalMembers || 1)) * f.memberCount
      : totalSpent / (tripData.families.length || 1);
    return { id: f.id, name: f.name, paid, share, balance: paid - share };
  });

  const calculateTransfers = () => {
    const debtors = familiesSettlement
      .filter(f => f.balance < -0.01)
      .map(f => ({ ...f, id: f.id, name: f.name, balance: Math.abs(f.balance) }));
    const creditors = familiesSettlement.filter(f => f.balance > 0.01);
    const transfers: Array<{ from: string; fromId: string; to: string; toId: string; amount: number }> = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
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
          <div key={f.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
              <h4 className="font-bold text-slate-900 leading-none">{f.name}</h4>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">CUOTA: {f.share.toFixed(2)}€</span>
            </div>
            <div className={`text-lg font-black ${f.balance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {f.balance >= 0 ? '+' : ''}{f.balance.toFixed(2)}€
            </div>
          </div>
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
                <button onClick={() => onToggleSettlement(transferKey)} className={`transition-colors ${isSettled ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-400'}`}>
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
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Grupo</h2>
        {isAdmin && (
          <button onClick={() => setShowAdd(!showAdd)} className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
            <Plus size={24} />
          </button>
        )}
      </div>
      {showAdd && isAdmin && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-indigo-100 shadow-xl space-y-4 animate-in zoom-in-95 duration-200">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nueva Familia</h3>
          <input className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none" placeholder="Apellido..." value={newFamily.name} onChange={e => setNewFamily({ ...newFamily, name: e.target.value })} />
          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl">
            <span className="text-xs font-bold text-slate-500 ml-2">Miembros</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setNewFamily({ ...newFamily, members: Math.max(1, newFamily.members - 1) })} className="w-10 h-10 rounded-lg bg-white border border-slate-200 font-bold">-</button>
              <span className="font-black">{newFamily.members}</span>
              <button onClick={() => setNewFamily({ ...newFamily, members: newFamily.members + 1 })} className="w-10 h-10 rounded-lg bg-white border border-slate-200 font-bold">+</button>
            </div>
          </div>
          <button onClick={() => { if (newFamily.name) { onAddFamily(newFamily.name, newFamily.members); setNewFamily({ name: '', members: 1 }); setShowAdd(false); } }} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl">Registrar</button>
        </div>
      )}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
        <div className="p-6"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Miembros</h3></div>
        {tripData.families.map(f => (
          <div key={f.id} className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${f.id === currentFamilyId ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>{f.name.charAt(0).toUpperCase()}</div>
                <div>
                  <h4 className="font-black text-slate-800 leading-none mb-1">{f.name}</h4>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{f.role}</p>
                </div>
              </div>
              {isAdmin && f.id !== tripData.adminId ? (
                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none" value={f.role} onChange={e => onUpdateRole(f.id, e.target.value as Role)}>
                  <option value={Role.USER}>Usuario</option>
                  <option value={Role.ADMIN}>Admin</option>
                </select>
              ) : (
                <span className="text-[10px] font-black tracking-widest uppercase bg-slate-50 px-3 py-1.5 rounded-lg text-slate-400">Lock</span>
              )}
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
      <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-xl font-black tracking-tight">ID</h4>
          <p className="text-xs text-indigo-200 font-bold">Para invitar.</p>
        </div>
        <div className="bg-white/20 backdrop-blur-md px-5 py-3 rounded-2xl font-mono font-black text-2xl tracking-widest">{tripData.id}</div>
      </div>
      {isAdmin && (
        <div className="pt-6">
          <button onClick={onDeleteTrip} className="w-full flex items-center justify-center gap-2 bg-rose-50 text-rose-600 font-black py-5 rounded-[2rem] border border-rose-100 hover:bg-rose-100">
            <Trash size={20} />
            <span>ELIMINAR VIAJE</span>
          </button>
        </div>
      )}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all group ${active ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
    <div className={`p-2 rounded-2xl transition-colors ${active ? 'bg-indigo-50 shadow-inner' : 'group-hover:bg-slate-50'}`}>{icon}</div>
    <span className={`text-[8px] font-black uppercase tracking-widest transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
  </button>
);

export default App;
