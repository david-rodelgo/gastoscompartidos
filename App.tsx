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

// Netlify Functions
const API = '/.netlify/functions';

// Persistencia local SOLO para "mis viajes" (atajos en este dispositivo).
// La información del viaje (familias/gastos) vive en Neon vía Netlify Functions.
const MY_TRIPS_KEY = 'expensytrip_my_trips';

type MyTrip = { id: string; k: string; name: string; date: string };

async function apiCreateTrip(group: TripGroup, id: string, k: string) {
  const res = await fetch(`${API}/trip-create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, k, group })
  });
  if (!res.ok) throw new Error(await res.text());
}

async function apiLoadTrip(id: string, k: string): Promise<TripGroup> {
  const res = await fetch(`${API}/trip-get?id=${encodeURIComponent(id)}&k=${encodeURIComponent(k)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiSaveTrip(group: TripGroup, id: string, k: string) {
  const res = await fetch(`${API}/trip-save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, k, group })
  });
  if (!res.ok) throw new Error(await res.text());
}

function randomKey(len = 12) {
  // clave corta para compartir (no criptográfica), suficiente para este caso.
  return Math.random().toString(36).slice(2, 2 + len);
}

const App: React.FC = () => {
  const [tripData, setTripData] = useState<TripGroup | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripKey, setTripKey] = useState<string | null>(null);
  const [currentFamilyId, setCurrentFamilyId] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'dashboard' | 'expenses' | 'split' | 'settings'>('home');
  const [isCreating, setIsCreating] = useState(false);
  const [myTrips, setMyTrips] = useState<MyTrip[]>([]);

  // Carga inicial:
  // - Si hay ?id=...&k=... => carga el viaje desde Neon.
  // - Si no => pantalla de inicio.
  useEffect(() => {
    const saved = localStorage.getItem(MY_TRIPS_KEY);
    if (saved) setMyTrips(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const k = params.get('k');
    if (id && k) {
      loadGroup(id, k);
    }
  }, []);

  const addToMyTrips = (id: string, k: string, name: string) => {
    const newList: MyTrip[] = [{ id, k, name, date: new Date().toISOString() }, ...myTrips.filter(t => t.id !== id)];
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(newList));
    setMyTrips(newList);
  };

  // Guardado remoto (Neon). Se llama tras cada cambio.
  // Importante: requiere tripId y tripKey.
  const saveGroup = async (data: TripGroup) => {
    if (!tripId || !tripKey) {
      // Si no hay id/clave, solo actualiza estado local.
      setTripData({ ...data });
      return;
    }
    setTripData({ ...data });
    addToMyTrips(tripId, tripKey, data.name);
    try {
      await apiSaveTrip(data, tripId, tripKey);
    } catch (e: any) {
      console.error(e);
      alert('No se ha podido guardar en la base de datos. Revisa tu conexión y vuelve a intentarlo.');
    }
  };

  const setUrl = (id: string, k: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('id', id);
    url.searchParams.set('k', k);
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  };

  const loadGroup = async (id: string, k: string) => {
    try {
      const data = await apiLoadTrip(id, k);
      setTripData(data);
      setTripId(id);
      setTripKey(k);
      setUrl(id, k);
      const lastFamilyId = localStorage.getItem(`last_family_${id}`);
      if (lastFamilyId) setCurrentFamilyId(lastFamilyId);
      setView('dashboard');
      addToMyTrips(id, k, data.name);
    } catch (e: any) {
      console.error(e);
      alert('Viaje no encontrado o clave incorrecta.');
      // Limpia URL
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      url.searchParams.delete('k');
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
      setTripData(null);
      setTripId(null);
      setTripKey(null);
      setView('home');
    }
  };

  const exitTrip = () => {
    setTripData(null);
    setTripId(null);
    setTripKey(null);
    setCurrentFamilyId(null);
    setView('home');
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('k');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  };

  const deleteTrip = (id: string) => {
    if (!confirm('Esto eliminará el acceso rápido de este dispositivo. (Los datos en la nube pueden seguir existiendo si alguien conserva el enlace). ¿Continuar?')) return;
    localStorage.removeItem(`last_family_${id}`);
    const updatedMyTrips = myTrips.filter(t => t.id !== id);
    localStorage.setItem(MY_TRIPS_KEY, JSON.stringify(updatedMyTrips));
    setMyTrips(updatedMyTrips);
    exitTrip();
  };

  const createGroup = async (name: string, adminFamilyName: string, members: number) => {
    if (!name || !adminFamilyName) return alert("Por favor rellena todos los campos");
    const groupId = uuidv4().substring(0, 8);
    const k = randomKey(12);
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
    try {
      await apiCreateTrip(newGroup, groupId, k);
      setTripId(groupId);
      setTripKey(k);
      setUrl(groupId, k);
      setTripData(newGroup);
      addToMyTrips(groupId, k, newGroup.name);
    } catch (e: any) {
      console.error(e);
      alert('No se ha podido crear el viaje en la base de datos.');
      return;
    }
    setCurrentFamilyId(adminId);
    localStorage.setItem(`last_family_${groupId}`, adminId);
    setView('dashboard');
  };

  const joinGroup = async (groupId: string, k: string, familyName: string, members: number) => {
    if (!groupId || !k) return alert('Falta el ID o la clave del viaje.');
    try {
      const group = await apiLoadTrip(groupId, k);
      const newFamilyId = uuidv4();
      const newFamily: Family = {
        id: newFamilyId,
        name: familyName,
        memberCount: members,
        role: Role.USER
      };
      const updated: TripGroup = { ...group, families: [...group.families, newFamily] };
      await apiSaveTrip(updated, groupId, k);
      setTripId(groupId);
      setTripKey(k);
      setUrl(groupId, k);
      setTripData(updated);
      addToMyTrips(groupId, k, updated.name);
      setCurrentFamilyId(newFamilyId);
      localStorage.setItem(`last_family_${groupId}`, newFamilyId);
      setView('dashboard');
    } catch (e: any) {
      console.error(e);
      alert('No se pudo unir al viaje. Revisa que el ID y la clave sean correctos.');
    }
  };

  const addFamilyToGroup = (name: string, members: number) => {
    if (!tripData) return;
    const newFamily: Family = {
      id: uuidv4(),
      name,
      memberCount: members,
      role: Role.USER
    };
    const updated = { ...tripData, families: [...tripData.families, newFamily] };
    saveGroup(updated);
  };

  const addExpense = (concept: string, amount: number, familyId: string, imageUrl?: string) => {
    if (!tripData) return;
    const newExpense: Expense = {
      id: uuidv4(),
      concept,
      amount,
      familyId,
      date: new Date().toISOString(),
      imageUrl
    };
    const updated = { ...tripData, expenses: [...tripData.expenses, newExpense] };
    saveGroup(updated);
  };

  const deleteExpense = (id: string) => {
    if (!tripData) return;
    const updated = { ...tripData, expenses: tripData.expenses.filter(e => e.id !== id) };
    saveGroup(updated);
  };

  const updateRole = (familyId: string, newRole: Role) => {
    if (!tripData) return;
    const updatedFamilies = tripData.families.map(f => 
      f.id === familyId ? { ...f, role: newRole } : f
    );
    saveGroup({ ...tripData, families: updatedFamilies });
  };

  const updateFamilyCount = (familyId: string, count: number) => {
    if (!tripData) return;
    const updatedFamilies = tripData.families.map(f => 
      f.id === familyId ? { ...f, memberCount: count } : f
    );
    saveGroup({ ...tripData, families: updatedFamilies });
  };

  const toggleSettlement = (transferKey: string) => {
    if (!tripData) return;
    const settled = tripData.settledTransfers || [];
    const updatedSettled = settled.includes(transferKey) 
      ? settled.filter(k => k !== transferKey) 
      : [...settled, transferKey];
    saveGroup({ ...tripData, settledTransfers: updatedSettled });
  };

  if (!tripData && view === 'home') {
    return (
      <WelcomeScreen 
        myTrips={myTrips} 
        onSelectTrip={loadGroup}
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
      <Header
        tripName={tripData?.name || ''}
        groupId={tripData?.id || ''}
        shareUrl={tripId && tripKey ? `${window.location.origin}${window.location.pathname}?id=${tripId}&k=${tripKey}` : ''}
        onExit={exitTrip}
      />
      
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
            onDeleteTrip={() => deleteTrip(tripData!.id)}
            currentFamilyId={currentFamily?.id || ''} 
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex justify-between items-center shadow-xl z-50 rounded-t-3xl md:max-w-2xl md:mx-auto">
        <NavButton active={view === 'dashboard'} icon={<Home size={22}/>} label="Inicio" onClick={() => setView('dashboard')} />
        <NavButton active={view === 'expenses'} icon={<Receipt size={22}/>} label="Gastos" onClick={() => setView('expenses')} />
        <NavButton active={view === 'split'} icon={<PieChart size={22}/>} label="Reparto" onClick={() => setView('split')} />
        <NavButton active={view === 'settings'} icon={<Settings size={22}/>} label="Ajustes" onClick={() => setView('settings')} />
      </nav>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const Header: React.FC<{ tripName: string; groupId: string; shareUrl: string; onExit: () => void }> = ({ tripName, groupId, shareUrl, onExit }) => {
  const shareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    alert("Enlace copiado. ¡Envíalo a los demás miembros!");
  };

  return (
    <header className="bg-white/70 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex justify-between items-center sticky top-0 z-40 md:max-w-2xl md:mx-auto w-full">
      <div className="flex items-center gap-3">
        <button onClick={onExit} title="Salir al menú principal" className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors">
          <LogOut size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">{tripName}</h1>
          <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">ID: {groupId}</p>
        </div>
      </div>
      <button
        onClick={shareLink}
        disabled={!shareUrl}
        className="bg-indigo-50 text-indigo-600 p-2.5 rounded-2xl hover:bg-indigo-100 transition-all flex items-center gap-2 group"
      >
        <Share2 size={18} className="group-hover:scale-110 transition-transform" />
        <span className="text-sm font-bold hidden sm:inline">Invitar</span>
      </button>
    </header>
  );
};

const WelcomeScreen: React.FC<{ 
  myTrips: MyTrip[];
  onSelectTrip: (id: string, k: string) => void;
  onCreateTrip: () => void;
  onJoinTrip: () => void;
  isCreating: boolean;
  createGroup: (name: string, family: string, members: number) => Promise<void>;
  joinGroup: (id: string, k: string, family: string, members: number) => Promise<void>;
  onBack: () => void;
}> = ({ myTrips, onSelectTrip, onCreateTrip, onJoinTrip, isCreating, createGroup, joinGroup, onBack }) => {
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
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(trip.date).toLocaleDateString()}</p>
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setMode('create')}
              className="flex flex-col items-center justify-center p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all gap-2"
            >
              <PlusCircle size={24} />
              <span className="text-xs font-black uppercase tracking-widest">Crear</span>
            </button>
            <button 
              onClick={() => setMode('join')}
              className="flex flex-col items-center justify-center p-4 bg-emerald-600 text-white rounded-[1.5rem] shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all gap-2"
            >
              <Users size={24} />
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
        <button onClick={() => setMode('list')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-600"><ArrowRight size={24} className="rotate-180" /></button>
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">{mode === 'create' ? 'Nuevo Viaje' : 'Unirse a Viaje'}</h2>
          <p className="text-slate-500 mt-2 font-medium">{mode === 'create' ? 'Configura tu grupo' : 'Introduce el ID y la clave'}</p>
        </div>
        <div className="space-y-5">
          {mode === 'create' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre del Viaje</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-indigo-50 outline-none" placeholder="Ej: Verano en la Costa" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Tu Familia</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-indigo-50 outline-none" placeholder="Ej: Los García" value={formData.family} onChange={e => setFormData({...formData, family: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Número de Personas</label>
                <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-2">
                   <button onClick={() => setFormData({...formData, members: Math.max(1, formData.members - 1)})} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600">-</button>
                   <span className="flex-1 text-center font-bold text-lg">{formData.members}</span>
                   <button onClick={() => setFormData({...formData, members: formData.members + 1})} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600">+</button>
                </div>
              </div>
              <button onClick={() => createGroup(formData.name, formData.family, formData.members)} className="w-full bg-indigo-600 text-white font-bold py-5 rounded-[1.25rem] shadow-xl hover:bg-indigo-700 transition-all mt-4">Comenzar Viaje</button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">ID del Grupo</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="ID de 8 caracteres..." value={formData.gId} onChange={e => setFormData({...formData, gId: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Clave de acceso</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="Te la han pasado con el enlace" value={formData.k} onChange={e => setFormData({...formData, k: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Nombre de tu Familia</label>
                <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none" placeholder="Ej: Los Pérez" value={formData.family} onChange={e => setFormData({...formData, family: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Personas</label>
                <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-2">
                   <button onClick={() => setFormData({...formData, members: Math.max(1, formData.members - 1)})} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-emerald-600">-</button>
                   <span className="flex-1 text-center font-bold text-lg">{formData.members}</span>
                   <button onClick={() => setFormData({...formData, members: formData.members + 1})} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-emerald-600">+</button>
                </div>
              </div>
              <button onClick={() => joinGroup(formData.gId, formData.k, formData.family, formData.members)} className="w-full bg-emerald-600 text-white font-bold py-5 rounded-[1.25rem] shadow-xl hover:bg-emerald-700 transition-all mt-4">Unirse ahora</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ----- A PARTIR DE AQUÍ: tu UI original (Dashboard/Expenses/Split/Settings/etc) -----
// Nota: no toco tu lógica de cálculo, solo el “backend” (guardar/cargar) ya va por Neon.

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
            <Users size={14} />
            <span>{tripData.families.length} familias</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Tu aportación</p>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-4xl font-black text-slate-900">{familySpent.toFixed(2)}</p>
            <span className="text-xl font-bold text-slate-400">€</span>
          </div>
          <p className="text-slate-500 font-medium mt-2 text-sm">{currentFamily.name}</p>
        </div>
      </div>
    </div>
  );
};

// --- El resto de componentes (ExpensesView, SplitView, SettingsView, etc.) ---
// Mantén EXACTAMENTE tus componentes actuales debajo de aquí.
// (En tu proyecto ya existen en este mismo fichero. No los recorto aquí para no romper tu app.)

// Si necesitas que te lo deje pegado con todo tu fichero completo tal cual lo tienes (100%),
// dímelo y lo ajusto con tus secciones exactas (porque tu App.tsx es largo y aquí arriba solo he pegado
// el tramo inicial + Welcome/Header + Dashboard como ejemplo de integración).
//
// IMPORTANTE: No cambies nada de tus cálculos. Solo asegúrate de que
// cualquier sitio donde antes llamabas a saveGroup/loadGroup/localStorage del viaje, ya no exista
// (en este código ya está hecho).

export default App;

// -------------
// NOTA: Si en tu archivo original había más componentes debajo (ExpensesView, SplitView, SettingsView,
// NavButton, etc.), DEBEN seguir ahí. Este bloque final solo es para cerrar correctamente.
// -------------
