/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Printer, 
  Settings, 
  Plus, 
  LogOut, 
  Search, 
  Bell, 
  CircleHelp,
  Dumbbell,
  QrCode,
  Download,
  Trash2,
  Edit3,
  FilterX,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
  Save,
  Info,
  ChevronDown,
  RefreshCcw,
  RefreshCw,
  Check,
  ExternalLink,
  CalendarClock,
  Mail,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ViewType, UserCategory, GymUser } from './types';
import { MOCK_USERS } from './constants';
import uaLogo from './assets/images/regenerated_image_1778687875822.png';

export default function App() {
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<GymUser | null>(null);
  
  // Global Persisted State
  const [excelUrl, setExcelUrl] = useState('');
  const [formUrlTemplate, setFormUrlTemplate] = useState('');
  const [linkCreatedDate, setLinkCreatedDate] = useState(new Date().toISOString());
  const [smtpConfig, setSmtpConfig] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    user: '',
    pass: '',
    targetEmail: ''
  });
  
  const [users, setUsers] = useState<GymUser[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  // Load Settings and Users from Server
  useEffect(() => {
    const initApp = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        const settings = await settingsRes.json();
        setExcelUrl(settings.excelUrl);
        setFormUrlTemplate(settings.formUrlTemplate);
        setLinkCreatedDate(settings.linkCreatedDate);
        setSmtpConfig(settings.smtpConfig);

        const usersRes = await fetch('/api/users');
        const userData = await usersRes.json();
        if (userData.users && userData.users.length > 0) {
          setUsers(userData.users);
        } else {
          // If no local users, try syncing once
          handleSync(settings.excelUrl);
        }
      } catch (error) {
        console.error("Failed to load initial data:", error);
      } finally {
        setIsSettingsLoading(false);
      }
    };
    initApp();
  }, []);

  const handleConfigClick = () => {
    if (activeView === 'config') return;
    setShowConfigWarning(true);
  };

  const confirmConfigAccess = () => {
    setShowConfigWarning(false);
    setActiveView('config');
  };

  const saveGlobalSettings = async (updates: any) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        alert("Ajustes globales guardados en el servidor con éxito.");
      }
    } catch (error) {
      console.error("Failed to save global settings:", error);
      alert("Error al guardar los ajustes en el servidor.");
    }
  };

  const handleExportSettings = () => {
    const config = {
      excelUrl,
      formUrlTemplate,
      smtpConfig,
      linkCreatedDate
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `config_gym_ua_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      
      if (!config.excelUrl && !config.smtpConfig) {
        throw new Error("El archivo no parece ser una configuración válida de Gym UA.");
      }

      setExcelUrl(config.excelUrl || '');
      setFormUrlTemplate(config.formUrlTemplate || '');
      setSmtpConfig(config.smtpConfig || smtpConfig);
      if (config.linkCreatedDate) setLinkCreatedDate(config.linkCreatedDate);

      // Save to server
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      alert("Configuración cargada e importada con éxito.");
    } catch (error: any) {
      console.error("Failed to import settings:", error);
      alert(`Error al importar configuración: ${error.message}`);
    } finally {
      // Clear input
      event.target.value = '';
    }
  };

  const notifyPowerAutomate = async (action: string, user: GymUser) => {
    if (!smtpConfig.targetEmail || !smtpConfig.user) {
      console.warn(`[SMTP] Notificación omitida para ${action} - Falta configuración (Email destino o Usuario)`);
      return;
    }

    console.log(`[SMTP] Intentando notificar acción: ${action} para RUT: ${user.rut}`);

    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          user,
          targetEmail: smtpConfig.targetEmail,
          smtpConfig: {
            host: smtpConfig.host,
            port: smtpConfig.port,
            user: smtpConfig.user,
            pass: smtpConfig.pass
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Error desconocido en servidor');
      }

      const resData = await response.json();
      console.log(`[SMTP] Notificación enviada con éxito: ${resData.messageId} para ${action} (${user.rut})`);
      
      // Temporary success indicator for user feedback
      if (action !== 'TEST_CONNECTION') {
        const successMsg = action === 'DELETE' ? 'Eliminación notificada' : action === 'CREATE' ? 'Creación notificada' : 'Actualización notificada';
        console.info(`[SMTP] ${successMsg} correctamente.`);
      } else {
        alert("✅ Conexión SMTP exitosa. El correo ha sido aceptado por el servidor.");
      }
    } catch (error: any) {
      console.error("[SMTP] Error al notificar a Power Automate:", error);
      alert(`⚠️ Pasarela de Correo: No se pudo enviar la notificación.\n\nAcción: ${action}\nDetalle: ${error.message}\n\nVerifique su configuración SMTP en 'AJUSTES'.`);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtpConfig.targetEmail || !smtpConfig.user || !smtpConfig.pass) {
      alert("Por favor complete todos los datos SMTP antes de probar.");
      return;
    }

    const testUser: GymUser = {
      id: 'test-id',
      rut: '1-9',
      fullName: 'USUARIO DE PRUEBA',
      category: UserCategory.FUNCIONARIO,
      createdAt: new Date().toISOString()
    };

    alert("Iniciando prueba de envío... espere un momento.");
    await notifyPowerAutomate('TEST_CONNECTION', testUser);
  };

  const daysRemaining = useMemo(() => {
    if (!linkCreatedDate) return 150;
    const created = new Date(linkCreatedDate);
    const expires = new Date(created.getTime() + 150 * 24 * 60 * 60 * 1000);
    const today = new Date();
    const diffTime = expires.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [linkCreatedDate]);

  const handleSync = async (overrideUrl?: string | any) => {
    // Ensure we don't use the React Event object as a URL if called from onClick directly
    const urlToUse = (typeof overrideUrl === 'string' ? overrideUrl : null) || excelUrl;
    if (!urlToUse) return;

    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToUse })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error(`El servidor devolvió una respuesta no válida (HTML). Esto suele significar que el enlace de SharePoint es inaccesible o requiere inicio de sesión.`);
      }

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Fallo al sincronizar');
      }

      if (data.users && Array.isArray(data.users)) {
        setUsers(data.users);
        alert(`Sincronización exitosa: ${data.users.length} usuarios cargados.`);
      } else {
        throw new Error('Formato de datos inválido desde el servidor');
      }
    } catch (error: any) {
      console.error(error);
      alert(`Error de sincronización: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Initial auto-sync on load
    handleSync();
  }, [excelUrl]);

  const handleRenewLink = () => {
    const newDate = new Date().toISOString();
    setLinkCreatedDate(newDate);
    saveGlobalSettings({ linkCreatedDate: newDate });
    alert("Enlace renovado por 150 días adicionales (Guardado Global).");
  };

  const handleEditUser = (user: GymUser) => {
    setEditingUser(user);
    setShowEditUserModal(true);
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    try {
      console.log(`Intentando eliminar usuario ID: ${userId}`);
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
        if (userToDelete) {
          await notifyPowerAutomate('DELETE', userToDelete);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'No se pudo eliminar el usuario en el servidor');
      }
    } catch (error: any) {
      console.error("Error al eliminar:", error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleUpdateUsers = async (updatedUser: GymUser) => {
    try {
      const response = await fetch(`/api/users/${updatedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        const saved = await response.json();
        setUsers(users.map(u => u.id === saved.id ? saved : u));
        await notifyPowerAutomate('UPDATE', saved);
        setShowEditUserModal(false);
        setEditingUser(null);
      } else {
        throw new Error('No se pudo actualizar el usuario');
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleAddUser = async (newUser: GymUser) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (response.ok) {
        const saved = await response.json();
        setUsers([saved, ...users]);
        await notifyPowerAutomate('CREATE', saved);
        setShowNewUserModal(false);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'No se pudo agregar el usuario');
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* SideNavBar */}
      <aside className="h-screen w-72 fixed left-0 top-0 bg-primary shadow-2xl flex flex-col px-md py-xl z-40">
        <div className="mb-xl flex flex-col items-center gap-md px-sm text-center">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-primary shadow-xl p-3 border border-white/10">
            <img 
              src={uaLogo} 
              alt="Logo UA" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-headline-sm font-black text-white leading-none tracking-tight">UA CONTROL</h1>
            <p className="text-[10px] text-white/40 uppercase font-black mt-2 tracking-[0.2em]">Musculación</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 mt-xl pl-4">
          <NavItem 
            id="users" 
            label="Usuarios" 
            icon={<Users size={22} />} 
            active={activeView === 'users'} 
            onClick={() => setActiveView('users')} 
          />
          <NavItem 
            id="printing" 
            label="Imprenta QR" 
            icon={<Printer size={22} />} 
            active={activeView === 'printing'} 
            onClick={() => setActiveView('printing')} 
          />
          <NavItem 
            id="config" 
            label="Ajustes" 
            icon={<Settings size={22} />} 
            active={activeView === 'config'} 
            onClick={handleConfigClick} 
          />
        </nav>

        <div className="mt-auto p-4">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNewUserModal(true)}
            className="w-full bg-secondary text-on-secondary py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-sm shadow-xl shadow-secondary/20 hover:brightness-110 transition-all border border-white/10"
          >
            <Plus size={20} />
            Nuevo Miembro
          </motion.button>
        </div>
      </aside>

      <main className="flex-1 ml-72 min-h-screen flex flex-col">
        {/* TopAppBar */}
        <header className="flex justify-between items-center px-margin h-20 w-full sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-outline-variant shadow-sm">
          <div className="flex items-center gap-md">
            <div className="pl-4">
              <h2 className="text-xl font-black text-primary tracking-tight">Gestión de Usuario Sala de Musculación</h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">DTI UA Talca</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {activeView === 'config' && (
               <a 
                href={excelUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-2 px-6 py-2 bg-primary/5 text-primary rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-primary hover:text-white transition-all border border-primary/10"
               >
                  <Download size={14} />
                  Acceder Base Maestra
               </a>
             )}
             <div className="text-right">
                <p className="text-[10px] text-secondary font-black uppercase tracking-widest">UA SEDE TALCA</p>
                <p className="text-xs text-primary font-bold opacity-60">Sistema de Control v1.0</p>
              </div>
          </div>
        </header>

        {/* View Content */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-margin flex-1"
          >
            {activeView === 'users' && (
              <UsersList 
                users={users} 
                isSyncing={isSyncing} 
                handleSync={handleSync} 
                onEdit={handleEditUser}
                onDelete={handleDeleteUser}
              />
            )}
            {activeView === 'printing' && <PrintingCenter users={users} formUrlTemplate={formUrlTemplate} />}
            {activeView === 'config' && <SettingsView 
              excelUrl={excelUrl} 
              setExcelUrl={setExcelUrl} 
              formUrlTemplate={formUrlTemplate}
              setFormUrlTemplate={setFormUrlTemplate}
              daysRemaining={daysRemaining}
              onRenewLink={handleRenewLink}
              smtpConfig={smtpConfig}
              setSmtpConfig={setSmtpConfig}
              onSaveGlobal={() => saveGlobalSettings({ excelUrl, formUrlTemplate, smtpConfig })}
              onTestSmtp={handleTestSmtp}
              isSyncing={isSyncing}
              onSync={handleSync}
              onExport={handleExportSettings}
              onImport={handleImportSettings}
            />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* New User Modal */}
      <AnimatePresence>
        {showNewUserModal && (
          <UserModal 
            title="Nuevo Registro de Usuario" 
            onClose={() => setShowNewUserModal(false)}
            onSave={handleAddUser}
            existingRuts={users.map(u => u.rut)}
          />
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {showEditUserModal && editingUser && (
          <UserModal 
            title="Editar Registro de Usuario" 
            user={editingUser}
            onClose={() => {
              setShowEditUserModal(false);
              setEditingUser(null);
            }}
            onSave={handleUpdateUsers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfigWarning && (
          <SecurityWarningModal 
            onClose={() => setShowConfigWarning(false)} 
            onConfirm={confirmConfigAccess} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface UserModalProps {
  title: string;
  user?: GymUser;
  onClose: () => void;
  onSave: (user: GymUser) => void;
  existingRuts?: string[];
}

function SecurityWarningModal({ onClose, onConfirm }: { onClose: () => void, onConfirm: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/40 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-primary/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-6 scale-110">
            <TriangleAlert size={40} strokeWidth={2.5} />
          </div>
          
          <h3 className="text-2xl font-black text-primary tracking-tight mb-4 uppercase">
            Acceso Restringido
          </h3>
          
          <p className="text-on-surface-variant font-medium leading-relaxed mb-8">
            Está intentando acceder a las configuraciones maestras del sistema. 
            <br/><br/>
            <span className="text-secondary font-bold">Sólo personal técnico o administradores</span> deben realizar cambios aquí, ya que podrían afectar la sincronización y el envío de notificaciones.
          </p>
          
          <div className="space-y-3">
            <button 
              onClick={onConfirm}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
            >
              Entiendo, deseo continuar
            </button>
            <button 
              onClick={onClose}
              className="w-full bg-primary/5 text-primary py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-primary/10 transition-all font-bold"
            >
              Cancelar y Volver
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function UserModal({ title, user, onClose, onSave, existingRuts = [] }: UserModalProps) {
  const [formData, setFormData] = useState({
    rut: user?.rut || '',
    fullName: user?.fullName || '',
    category: user?.category || UserCategory.FUNCIONARIO,
  });

  const cleanRut = (r: string) => String(r || "").replace(/[^0-9kK]/g, "").toUpperCase();

  const normalizeRut = (r: string) => {
    const clean = cleanRut(r);
    if (clean.length < 2) return clean;
    const dv = clean.slice(-1);
    const num = clean.slice(0, -1);
    
    let formatted = "";
    let i = num.length;
    while (i > 0) {
      formatted = (i - 3 > 0 ? "." : "") + num.slice(Math.max(0, i - 3), i) + formatted;
      i -= 3;
    }
    return `${formatted}-${dv}`;
  };

  const normalizedInputRut = normalizeRut(formData.rut);
  const isDuplicateRut = !user && existingRuts.map(cleanRut).includes(cleanRut(formData.rut));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rut.trim() || !formData.fullName.trim()) {
      alert("Por favor, complete RUT y Nombre.");
      return;
    }

    if (isDuplicateRut) {
      alert("Este RUT ya se encuentra registrado en el sistema. No se permiten duplicados.");
      return;
    }

    const savedUser: GymUser = {
      ...(user || { 
        id: `local-${Date.now()}`,
        createdAt: new Date().toISOString()
      }),
      ...formData,
      rut: normalizedInputRut // Save normalized RUT
    } as any;
    
    onSave(savedUser);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-outline-variant overflow-hidden"
      >
        <div className="bg-primary px-8 py-6 border-b border-white/10">
          <h2 className="text-headline-md text-white font-black tracking-tight">{title}</h2>
          <p className="text-body-sm text-white/60 mt-1 uppercase font-bold tracking-widest text-[10px]">Portal de Miembros Gym UA</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">RUT del Usuario</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 group-focus-within:text-secondary transition-colors z-10">
                  <Users size={20} />
                </div>
                <input 
                  value={formData.rut}
                  onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
                  className={`w-full pl-14 pr-4 py-4 bg-surface-container border ${isDuplicateRut ? 'border-red-500' : 'border-outline-variant'} rounded-2xl outline-none focus:bg-white focus:ring-1 focus:ring-secondary transition-all font-bold text-primary`} 
                  placeholder="12.345.678-9" 
                  type="text" 
                />
                {isDuplicateRut && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 px-1 uppercase tracking-wider">
                    ⚠️ Este RUT ya existe en el sistema
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Nombre Completo</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/30 group-focus-within:text-secondary transition-colors z-10">
                  <Users size={20} />
                </div>
                <input 
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full pl-14 pr-4 py-4 bg-surface-container border border-outline-variant rounded-2xl outline-none focus:bg-white focus:ring-1 focus:ring-secondary transition-all font-bold text-primary" 
                  placeholder="Ej: Juan Pérez" 
                  type="text" 
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <span className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Categoría de Ingreso</span>
            <div className="grid grid-cols-2 gap-4">
              <label className="cursor-pointer group">
                <input 
                  className="sr-only peer" 
                  name="category" 
                  type="radio" 
                  value={UserCategory.FUNCIONARIO}
                  checked={formData.category === UserCategory.FUNCIONARIO}
                  onChange={() => setFormData({ ...formData, category: UserCategory.FUNCIONARIO })}
                />
                <div className="flex items-center justify-center gap-3 p-6 border border-outline-variant rounded-2xl bg-white peer-checked:bg-primary peer-checked:text-white transition-all shadow-sm hover:border-secondary">
                  <Dumbbell size={24} className="peer-checked:text-secondary" />
                  <span className="text-label-md font-black uppercase tracking-widest text-xs">Funcionario</span>
                </div>
              </label>
              <label className="cursor-pointer group">
                <input 
                  className="sr-only peer" 
                  name="category" 
                  type="radio" 
                  value={UserCategory.FAMILIAR}
                  checked={formData.category === UserCategory.FAMILIAR}
                  onChange={() => setFormData({ ...formData, category: UserCategory.FAMILIAR })}
                />
                <div className="flex items-center justify-center gap-3 p-6 border border-outline-variant rounded-2xl bg-white peer-checked:bg-primary peer-checked:text-white transition-all shadow-sm hover:border-secondary">
                  <Users size={24} className="peer-checked:text-secondary" />
                  <span className="text-label-md font-black uppercase tracking-widest text-xs">Familiar</span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse md:flex-row justify-end items-center gap-4 pt-8 pb-4">
            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="px-10 py-4 font-black uppercase tracking-widest text-[10px] text-on-surface-variant border border-outline-variant rounded-2xl hover:bg-surface-container transition-all" 
                type="button"
              >
                Cancelar
              </button>
              <button 
                className="px-10 py-4 font-black uppercase tracking-widest text-[10px] text-on-secondary bg-secondary rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-secondary/20" 
                type="submit"
              >
                {user ? 'Actualizar Registro' : 'Guardar Registro'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function NavItem({ id, label, icon, active, onClick }: { id: string, label: string, icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-md px-md py-lg cursor-pointer transition-all duration-300 rounded-xl group relative ${
        active 
          ? 'text-white' 
          : 'text-white/40 hover:text-white/70'
      }`}
    >
      {active && (
        <motion.div 
          layoutId="nav-bg"
          className="absolute inset-0 bg-white/5 rounded-xl border border-white/10"
        />
      )}
      <div className={`${active ? 'text-secondary' : 'group-hover:text-secondary/60'} transition-colors duration-300 relative z-10 mr-1`}>
        {icon}
      </div>
      <span className="text-label-md font-black tracking-[0.15em] relative z-10 uppercase text-[11px]">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-line"
          className="absolute left-0 w-1.5 h-8 bg-secondary rounded-full -translate-x-md" 
        />
      )}
    </div>
  );
}

function IconButton({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors cursor-pointer active:opacity-80">
      {icon}
    </button>
  );
}

// --- Views ---

function StatCard({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-md rounded-xl border border-outline-variant shadow-sm flex items-center gap-md">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest">{label}</p>
        <p className="text-headline-sm font-black text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function UsersList({ 
  users, 
  isSyncing, 
  handleSync,
  onEdit,
  onDelete
}: { 
  users: GymUser[], 
  isSyncing: boolean, 
  handleSync: () => void,
  onEdit: (user: GymUser) => void,
  onDelete: (id: string) => void
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           user.rut.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'Todas' || user.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [users, searchTerm, categoryFilter]);

  const confirmDelete = (id: string) => {
    onDelete(id);
    setDeletingId(null);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('Todas');
  };

  return (
    <div className="space-y-xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
        <div className="pl-4">
          <h3 className="text-headline-lg font-black text-primary tracking-tight">Lista de Usuarios</h3>
          <p className="text-on-surface-variant font-bold uppercase tracking-widest text-[10px] opacity-60">Gestión de Miembros Activos ({filteredUsers.length} de {users.length})</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-white text-primary border border-outline-variant px-8 py-3 rounded-2xl flex items-center gap-2 font-black uppercase tracking-widest text-[10px] hover:bg-surface-container transition-all">
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm flex flex-wrap gap-6 items-center">
        <div className="flex flex-col gap-2 min-w-[150px]">
          <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest px-1">Categoría</label>
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-surface-container border border-outline-variant rounded-xl text-body-sm font-bold py-3 px-4 outline-none focus:bg-white focus:ring-1 focus:ring-secondary transition-all"
          >
            <option>Todas</option>
            <option>Funcionario</option>
            <option>Familiar</option>
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
          <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest px-1">Búsqueda rápida</label>
          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/30 group-focus-within:text-secondary transition-colors" size={18} />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant rounded-xl pl-14 py-3 text-body-sm font-bold outline-none focus:bg-white focus:ring-1 focus:ring-secondary transition-all" 
              placeholder="Escriba Nombre o RUT..." 
              type="text"
            />
          </div>
        </div>
        <div className="self-end pb-[2px]">
          <button 
            onClick={clearFilters}
            className="p-3 text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors" title="Limpiar filtros"
          >
            <FilterX size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-outline-variant shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-8 py-3 w-16 text-center">
                  <input className="rounded-md border-white/20 bg-white/10 text-secondary w-4 h-4 cursor-pointer focus:ring-0" type="checkbox" />
                </th>
                <th className="px-6 py-3 font-black uppercase tracking-[0.2em] opacity-80">RUT</th>
                <th className="px-6 py-3 font-black uppercase tracking-[0.2em] opacity-80">Nombre Completo</th>
                <th className="px-6 py-3 font-black uppercase tracking-[0.2em] opacity-80 text-center">Categoría</th>
                <th className="px-8 py-3 font-black uppercase tracking-[0.2em] opacity-80 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-container transition-all group">
                    <td className="px-8 py-3 text-center">
                      <input className="rounded-md border-outline-variant text-secondary w-4 h-4 cursor-pointer focus:ring-secondary" type="checkbox" />
                    </td>
                    <td className="px-6 py-3 text-primary/70 font-black tracking-tighter">{user.rut}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-black text-[10px] shadow-sm">
                          {user.fullName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-primary font-black tracking-tight">{user.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        user.category === UserCategory.FUNCIONARIO 
                          ? 'bg-secondary text-white' 
                          : 'bg-primary/10 text-primary'
                      }`}>
                        {user.category}
                      </span>
                    </td>
                    <td className="px-8 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {deletingId === user.id ? (
                          <div className="flex items-center gap-2 bg-white border border-gray-100 p-1 rounded-xl shadow-lg ring-1 ring-black/5">
                            <button 
                              onClick={() => confirmDelete(user.id)}
                              className="px-3 py-1.5 bg-red-200 text-red-900 text-[10px] font-black rounded-lg uppercase hover:bg-red-300 transition-colors"
                            >
                              Eliminar
                            </button>
                            <button 
                              onClick={() => setDeletingId(null)}
                              className="px-3 py-1.5 bg-green-200 text-green-900 text-[10px] font-black rounded-lg uppercase hover:bg-green-300 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => onEdit(user)}
                              className="p-2 text-primary/30 hover:text-secondary hover:bg-secondary/5 rounded-lg transition-all"
                              title="Editar usuario"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button 
                              onClick={() => setDeletingId(user.id)}
                              className="p-2 text-primary/30 hover:text-error hover:bg-error/5 rounded-lg transition-all"
                              title="Eliminar usuario"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-on-surface-variant/40 font-black uppercase tracking-widest text-[10px]">
                    No se encontraron usuarios que coincidan con la búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-3 bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-md border-t border-outline-variant">
          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">Mostrando {filteredUsers.length} de {users.length} usuarios</span>
          <div className="flex items-center gap-1.5">
            <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-outline-variant hover:bg-primary hover:text-white transition-all text-primary/40">
              <ChevronLeft size={16} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary text-white font-black text-[10px]">1</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-outline-variant hover:bg-primary hover:text-white transition-all font-black text-[10px]">2</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-outline-variant hover:bg-primary hover:text-white transition-all text-primary/40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
        <StatCard 
          label="Total Usuarios" 
          value={users.length.toLocaleString()} 
          icon={<Users size={20} />} 
          color="bg-primary/5 text-primary" 
        />
        <StatCard 
          label="Funcionarios" 
          value={users.filter(u => u.category.toLowerCase().includes('funcionario')).length.toLocaleString()} 
          icon={<Dumbbell size={20} />} 
          color="bg-secondary/10 text-secondary" 
        />
        <StatCard 
          label="Familiares" 
          value={users.filter(u => u.category.toLowerCase().includes('familiar')).length.toLocaleString()} 
          icon={<Users size={20} />} 
          color="bg-primary/5 text-primary" 
        />
      </div>
    </div>
  );
}

function PrintingCenter({ users, formUrlTemplate }: { users: GymUser[], formUrlTemplate: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         user.rut.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || user.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handlePrint = () => {
    window.print();
  };

  const getQrUrl = (rut: string) => {
    // Construct the Microsoft Form pre-filled URL
    const encodedData = encodeURIComponent(formUrlTemplate + rut);
    return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodedData}`;
  };

  const downloadQr = async (user: GymUser) => {
    try {
      const url = getQrUrl(user.rut);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `QR_${user.rut}_${user.fullName.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed', error);
      alert('Error al descargar el QR. Intente nuevamente.');
    }
  };

  return (
    <div className="space-y-xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md print:hidden">
        <div className="pl-4">
          <h1 className="text-headline-lg font-black text-primary tracking-tight">Imprenta Digital QR</h1>
          <p className="text-on-surface-variant font-bold uppercase tracking-widest text-[10px] opacity-60">
            {filteredUsers.length} credenciales filtradas de {users.length} totales
          </p>
        </div>
        <button 
          onClick={handlePrint}
          className="bg-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-3 shadow-2xl shadow-primary/20 hover:brightness-125 transition-all active:scale-95"
        >
          <Printer size={18} />
          Imprimir Pliego Filtrado
        </button>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-outline-variant shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-40" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o RUT..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-surface-container rounded-2xl border border-outline-variant outline-none focus:ring-1 focus:ring-secondary transition-all font-bold text-body-sm"
            />
          </div>
          <div className="flex gap-2 bg-surface-container p-1.5 rounded-2xl border border-outline-variant">
            {['All', 'Funcionario', 'Familiar'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all ${
                  categoryFilter === cat ? 'bg-white text-secondary shadow-sm' : 'text-on-surface-variant opacity-60 hover:opacity-100'
                }`}
              >
                {cat === 'All' ? 'Todos' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter print:grid-cols-2 print:gap-4 print:pt-4">
        {filteredUsers.map(user => (
          <div key={user.id} className="bg-white border-2 border-outline-variant rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-xl hover:border-secondary transition-all group relative overflow-hidden print:shadow-none print:border-black print:rounded-none print:p-8 break-inside-avoid">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 -translate-y-16 translate-x-16 rounded-full print:hidden" />
            
            <div className="w-full bg-white flex items-center justify-center mb-8 border border-outline-variant rounded-3xl p-6 relative z-10 shadow-inner print:mb-4 print:p-2 print:border-none print:shadow-none">
              <img alt={`QR ${user.rut}`} className="w-48 h-48 sm:w-full sm:h-full object-contain" src={getQrUrl(user.rut)} />
            </div>
            
            <div className="mb-8 relative z-10 print:mb-2 text-center">
              <h3 className="text-headline-sm font-black text-primary leading-tight tracking-tight print:text-xl">{user.fullName}</h3>
              <div className="mt-2 inline-block bg-secondary/10 px-4 py-1 rounded-full print:bg-transparent print:border print:border-black">
                <p className="text-[10px] text-secondary uppercase font-black tracking-[0.2em] print:text-black print:font-bold">RUT {user.rut}</p>
              </div>
              <div className="mt-1 print:block hidden text-[10px] font-black uppercase tracking-widest text-black/40">
                Pase de Acceso UA - {user.category}
              </div>
            </div>
            
            <button 
              onClick={() => downloadQr(user)}
              className="mt-auto w-full py-4 px-6 bg-primary text-white rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] hover:bg-secondary transition-all shadow-lg active:scale-95 print:hidden"
            >
              <Download size={16} />
              Descargar Pase
            </button>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-20 bg-surface-container rounded-[3rem] border border-dashed border-outline-variant">
          <p className="text-on-surface-variant font-black uppercase tracking-widest text-xs opacity-40">No se encontraron usuarios con los criterios actuales</p>
        </div>
      )}
    </div>
  );
}

function SettingsView({ 
  excelUrl, 
  setExcelUrl, 
  formUrlTemplate, 
  setFormUrlTemplate,
  daysRemaining, 
  onRenewLink,
  smtpConfig,
  setSmtpConfig,
  onSaveGlobal,
  onTestSmtp,
  isSyncing,
  onSync,
  onExport,
  onImport
}: { 
  excelUrl: string, 
  setExcelUrl: (url: string) => void, 
  formUrlTemplate: string,
  setFormUrlTemplate: (url: string) => void,
  daysRemaining: number, 
  onRenewLink: () => void,
  smtpConfig: any,
  setSmtpConfig: (config: any) => void,
  onSaveGlobal: () => void,
  onTestSmtp: () => void,
  isSyncing: boolean,
  onSync: () => void,
  onExport: () => void,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
        <div className="pl-4">
          <h1 className="text-headline-lg font-black text-primary tracking-tight">Ajustes del Sistema</h1>
          <p className="text-on-surface-variant font-bold uppercase tracking-widest text-[10px] opacity-60">Configuración global para toda la organización</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="cursor-pointer bg-white border border-primary text-primary px-8 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-sm hover:bg-primary/5 active:scale-95 transition-all">
            <Plus size={20} />
            Cargar Configuración
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              onChange={onImport}
            />
          </label>
          <button 
            onClick={onExport}
            className="bg-white border border-primary text-primary px-8 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-sm hover:bg-primary/5 active:scale-95 transition-all"
          >
            <Download size={20} />
            Descargar Configuración
          </button>
          <button 
            disabled={isSyncing}
            onClick={onSync}
            className={`bg-secondary text-white px-8 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-sm hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-secondary/20 ${isSyncing ? 'opacity-50' : ''}`}
          >
            {isSyncing ? <RefreshCcw size={20} className="animate-spin" /> : <RefreshCw size={20} />}
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Excel'}
          </button>
          <button 
            onClick={onSaveGlobal}
            className="bg-primary text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-sm hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-primary/20"
          >
            <Save size={20} />
            Guardar en Servidor
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-outline-variant shadow-lg overflow-hidden">
        <div className="p-8 border-b border-outline-variant bg-surface-container/30">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${daysRemaining > 15 ? 'bg-secondary text-white' : 'bg-error text-white animate-pulse'}`}>
                <CalendarClock size={20} />
              </div>
              <div>
                <h3 className="text-headline-sm font-black text-primary tracking-tight">Vigencia del Enlace Compartido</h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
                  {daysRemaining > 0 
                    ? `Quedan ${daysRemaining} días de acceso` 
                    : 'EL ENLACE HA EXPIRADO'}
                </p>
              </div>
            </div>
            <button 
              onClick={onRenewLink}
              className="bg-secondary text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-secondary/20 hover:brightness-110 transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Resetear Contador (150 días)
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-headline-sm font-black text-primary tracking-tight">Vínculo Maestro de SharePoint</h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">Enlace con acceso de edición para cualquier persona</p>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">URL de Edición de Excel</label>
                <div className="relative group">
                  <input 
                    className="w-full px-6 py-4 border border-outline-variant rounded-2xl bg-surface-container focus:bg-white focus:ring-1 focus:ring-secondary outline-none text-body-sm font-bold transition-all" 
                    value={excelUrl}
                    onChange={(e) => setExcelUrl(e.target.value)}
                    placeholder="https://aluautonoma365-my.sharepoint.com/..."
                  />
                </div>
              </div>
              <a 
                href={excelUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <ExternalLink size={14} />
                Abrir en SharePoint
              </a>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-outline-variant">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="text-headline-sm font-black text-primary tracking-tight">Pasarela de Correo (Power Automate)</h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">Sincronización remota mediante eventos de correo</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-surface-container/50 rounded-3xl border border-outline-variant">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Email de Destino (Gateway)</label>
                  <input 
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-white focus:ring-1 focus:ring-secondary outline-none text-xs font-bold transition-all" 
                    value={smtpConfig.targetEmail}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, targetEmail: e.target.value })}
                    placeholder="tu-flujo@powerautomate.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Servidor SMTP</label>
                  <input 
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-white focus:ring-1 focus:ring-secondary outline-none text-xs font-bold transition-all" 
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Usuario SMTP</label>
                  <input 
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-white focus:ring-1 focus:ring-secondary outline-none text-xs font-bold transition-all" 
                    value={smtpConfig.user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    placeholder="ejemplo@gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Contraseña SMTP (o App Password)</label>
                  <input 
                    type="password"
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-white focus:ring-1 focus:ring-secondary outline-none text-xs font-bold transition-all" 
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                  />
                </div>
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-outline-variant pt-6">
                <div className="flex items-center gap-2 p-3 bg-secondary/10 rounded-xl text-[9px] font-bold text-secondary uppercase tracking-widest flex-1">
                  <Info size={14} />
                  Nota: Configure Power Automate para leer correos con el asunto "[GYM-UA-ACTION]".
                </div>
                <button 
                  onClick={onTestSmtp}
                  className="bg-white border border-secondary text-secondary px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-secondary hover:text-white transition-all flex items-center gap-2"
                >
                  <Send size={14} />
                  Probar Configuración
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-outline-variant">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                <Download size={20} />
              </div>
              <div>
                <h3 className="text-headline-sm font-black text-primary tracking-tight">Exportación UA</h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">Generación de archivo maestro actualizado</p>
              </div>
            </div>
            
            <div className="p-6 bg-surface-container/50 rounded-3xl border border-outline-variant flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-primary">Descargar Base de Datos Local</p>
                <p className="text-[10px] text-on-surface-variant font-bold opacity-60">Se generará un archivo .xlsx con todos los cambios actuales.</p>
              </div>
              <a 
                href="/api/download-excel" 
                download
                className="px-10 py-4 bg-secondary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-secondary/20 hover:brightness-110 transition-all flex items-center gap-2"
              >
                <Save size={14} />
                Descargar Excel Actualizado
              </a>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-outline-variant">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                <QrCode size={20} />
              </div>
              <div>
                <h3 className="text-headline-sm font-black text-primary tracking-tight">Configuración de Formulario Microsoft Forms</h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-60">URL base donde se enviará al usuario al escanear el QR</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] px-1">Template de Formulario (Pre-rellenado)</label>
              <div className="relative group">
                <input 
                  className="w-full px-6 py-4 border border-outline-variant rounded-2xl bg-surface-container focus:bg-white focus:ring-1 focus:ring-secondary outline-none text-body-sm font-bold transition-all" 
                  value={formUrlTemplate}
                  onChange={(e) => setFormUrlTemplate(e.target.value)}
                  placeholder="https://forms.cloud.microsoft/...&r586...="
                />
              </div>
              <p className="text-[10px] text-on-surface-variant/40 mt-1 italic px-2">
                * El RUT del usuario se concatenará automáticamente al final de este enlace.
              </p>
            </div>
          </div>

          <div className={`p-6 rounded-3xl border ${daysRemaining <= 15 ? 'bg-error/5 border-error/20' : 'bg-primary/5 border-primary/10'}`}>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-4 ${daysRemaining <= 15 ? 'text-error' : 'text-primary'}`}>Nota sobre Escritura Automática</h4>
            <div className="flex items-start gap-4">
              <TriangleAlert className={daysRemaining <= 15 ? 'text-error' : 'text-secondary'} size={20} />
              <div className="space-y-2">
                <p className="text-xs text-primary/70 font-bold">
                  Debido a políticas de seguridad de Microsoft SharePoint, la escritura directa y automática en el archivo remoto requiere autenticación oficial (Microsoft Graph API).
                </p>
                <p className="text-xs font-bold text-on-surface-variant">
                  Para mantener tus datos sincronizados, utiliza el portal para gestionar usuarios y, cuando desees actualizar tu archivo maestro en SharePoint, utiliza el botón <strong>'Descargar Excel Actualizado'</strong> para reemplazar el archivo original.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-gutter items-start">
        <div className="bg-white rounded-[2rem] border border-outline-variant shadow-lg overflow-hidden p-12 text-center">
          <Info className="mx-auto text-primary/20 mb-4" size={48} />
          <h3 className="text-xl font-black text-primary uppercase tracking-tight">Información del Sistema</h3>
          <p className="max-w-xl mx-auto mt-2 text-on-surface-variant font-bold text-xs">
            Esta plataforma opera con datos sincronizados directamente desde el archivo maestro Usuarios.xlsx. 
            Todos los cambios realizados en el archivo remoto se reflejarán automáticamente al presionar "Sincronizar". 
            Los usuarios eliminados localmente no volverán a aparecer tras una sincronización.
          </p>
        </div>
      </div>
    </div>
  );
}
