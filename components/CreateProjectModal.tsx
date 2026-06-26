
import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, HardDrive, Cloud, Loader2, CheckCircle, Bot } from 'lucide-react';
import * as Icons from 'lucide-react';
import { ProjectStorageType, ProjectType } from '../types';
import { api } from '../services/api';
import { loadDynamicRegistry, ModelOption } from './project/lab/ModelSelector/registry/index';
import GoogleAuthMockModal from './GoogleAuthMockModal';
import { getProjectTypes } from '../services/projectTypes';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { DEFAULT_GOOGLE_TEXT_MODEL } from '../utils/googleModelIds';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectType?: string;
  onCreate: (name: string, description: string, storage: ProjectStorageType, projectType: string, color: string, driveFolderId?: string, defaultEngine?: string) => Promise<void>;
}

interface CustomType {
    id: string;
    label: string;
    description: string;
    iconName: string;
    color: string;
}

const COLORS = [
  '#1e293b', // Slate 800 (Default)
  '#334155', // Slate 700
  '#0f172a', // Slate 900
  '#475569', // Slate 600
  '#7c3aed', // Violet 600
  '#4c1d95', // Violet 900
  '#be123c', // Rose 700
  '#831843', // Pink 900
  '#db2777', // Pink 600
  '#166534', // Green 800
  '#14532d', // Green 900
  '#0f766e', // Teal 700
  '#0369a1', // Sky 700
  '#2563eb', // Blue 600
  '#1e3a8a', // Blue 900
  '#9333ea', // Purple 600
  '#b45309', // Amber 700
  '#7c2d12', // Orange 900
  '#dc2626', // Red 600
  '#f59e0b', // Amber 500
];

const SYSTEM_TYPES = [
    { id: 'all', label: 'Mixed Cluster', desc: 'Allow all asset types (General Purpose)', icon: 'LayoutGrid' },
    { id: 'image', label: 'Visual Cluster', desc: 'Focus on static images & photos', icon: 'ImageIcon' },
    { id: 'video', label: 'Temporal Stream', desc: 'Cinematic video & motion assets', icon: 'Video' },
    { id: 'text', label: 'Linguistic Docs', desc: 'Structured documents & reasoning', icon: 'FileText' },
    { id: 'files', label: 'File Archive', desc: 'General file storage & binaries', icon: 'HardDrive' },
];

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, initialProjectType = 'all', onCreate }) => {
  const { alert, alertDialog } = useModalDialogs();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [storage, setStorage] = useState<ProjectStorageType>(ProjectStorageType.LOCAL_DRIVE);
  const [projectType, setProjectType] = useState<string>('all');
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [defaultEngine, setDefaultEngine] = useState(DEFAULT_GOOGLE_TEXT_MODEL);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isDriveAuthLoading, setIsDriveAuthLoading] = useState(false);
  const [driveFolders, setDriveFolders] = useState<{id: string, name: string}[]>([]);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(true); 
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [connectedUser, setConnectedUser] = useState<{email: string, name: string, avatar: string} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean }>({});

  const fetchCustomTypes = useCallback(async () => {
    try {
        setCustomTypes(await getProjectTypes());
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCustomTypes();
      setName('');
      setDescription('');
      setStorage(ProjectStorageType.LOCAL_DRIVE);
      setProjectType(initialProjectType);
      setSelectedColor(COLORS[0]);
      setIsSubmitting(false);
      setTouched({});
      setIsDriveConnected(false);
      setDriveFolders([]);
      setSelectedDriveFolder('');
      setNewFolderName('');
      setShowNewFolderInput(true);
      setShowAuthModal(false);
      setConnectedUser(null);
      setDefaultEngine(DEFAULT_GOOGLE_TEXT_MODEL);
      
      const syncRegistry = async () => {
          const registry = await loadDynamicRegistry();
          setAvailableModels(registry);
          const preferredModel = registry.find(m => m.id === DEFAULT_GOOGLE_TEXT_MODEL)
              || registry.find(m => !m.isPaid && m.category !== 'Static')
              || registry.find(m => m.category !== 'Static')
              || registry[0];
          if (preferredModel) {
              setDefaultEngine(preferredModel.id);
          }
      };
      syncRegistry();
    }
  }, [fetchCustomTypes, initialProjectType, isOpen]);

  useEffect(() => {
      if (showNewFolderInput && !isSubmitting) {
          setNewFolderName(name);
      }
  }, [name, showNewFolderInput, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true });
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      let finalFolderId = selectedDriveFolder;
      if (storage === ProjectStorageType.GOOGLE_DRIVE) {
          if (showNewFolderInput && newFolderName) {
              const newFolder = await api.drive.createFolder(newFolderName);
              finalFolderId = newFolder.id;
          } else if (!selectedDriveFolder) {
              const newFolder = await api.drive.createFolder(name || 'Untitled Project');
              finalFolderId = newFolder.id;
          }
      }

      await onCreate(name, description, storage, projectType, selectedColor, finalFolderId, defaultEngine);
      onClose();
    } catch (error) {
      console.error("Failed to create project", error);
      setIsSubmitting(false);
    }
  };

  const handleConnectDrive = async () => {
      if (api.drive.isReal()) {
          setIsDriveAuthLoading(true);
          try {
              const userInfo = await api.drive.authorize();
              if (userInfo) {
                  setConnectedUser({ email: userInfo.email!, name: userInfo.name!, avatar: userInfo.avatar! });
                  setIsDriveConnected(true);
                  setNewFolderName(name || 'New Project');
                  setShowNewFolderInput(true);
                  const folders = await api.drive.listFolders();
                  setDriveFolders(folders);
              }
          } catch(e) {
              await alert({
                title: 'Connection Failed',
                description: 'Failed to connect to Google Drive.',
                tone: 'danger'
              });
          } finally {
              setIsDriveAuthLoading(false);
          }
      } else {
          setShowAuthModal(true);
      }
  };

  const getIcon = (name: string) => {
      const Icon = (Icons as any)[name] || Icons.LayoutGrid;
      return <Icon size={16} />;
  };
  const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(selectedColor) ? selectedColor : COLORS[0];

  if (!isOpen) return null;
  const isNameInvalid = touched.name && !name.trim();

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/50">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Ecosystem Ingest</h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Provisioning New Workspace</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-all p-2 rounded-full hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Neural Metadata</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Workspace Name (e.g. Marketing Q4)"
                    className={`w-full bg-slate-800 border rounded-xl p-3.5 text-white placeholder-slate-600 focus:outline-none focus:ring-2 transition-all ${isNameInvalid ? 'border-red-500/50 ring-red-500/20' : 'border-slate-700 focus:ring-indigo-500/30'}`}
                    autoFocus
                />
            </div>
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Technical notes or project scope details..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all h-24 resize-none"
            />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Neural Intent (Project Type)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYSTEM_TYPES.map(opt => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => setProjectType(opt.id)}
                        className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${projectType === opt.id ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}
                    >
                        <div className={`p-2 rounded-xl border ${projectType === opt.id ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                            {getIcon(opt.icon)}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-[11px] font-black uppercase tracking-tight leading-none ${projectType === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                            <p className="text-[9px] text-slate-500 font-medium mt-1 leading-tight">{opt.desc}</p>
                        </div>
                    </button>
                ))}
                {customTypes.map(opt => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => setProjectType(opt.id)}
                        className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${projectType === opt.id ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}
                    >
                        <div className={`p-2 rounded-xl border transition-all`} style={{ color: projectType === opt.id ? '#fff' : opt.color, backgroundColor: projectType === opt.id ? opt.color : 'transparent', borderColor: projectType === opt.id ? opt.color : '#1e293b' }}>
                            {getIcon(opt.iconName)}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-[11px] font-black uppercase tracking-tight leading-none ${projectType === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                            <p className="text-[9px] text-slate-500 font-medium mt-1 leading-tight">{opt.description}</p>
                        </div>
                    </button>
                ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Infrastructure Layer (Storage)</label>
            <div className="grid grid-cols-1 gap-3">
               <button type="button" onClick={() => setStorage(ProjectStorageType.LOCAL_DRIVE)} className={`flex items-center p-4 rounded-2xl border transition-all ${storage === ProjectStorageType.LOCAL_DRIVE ? 'bg-emerald-600/10 border-emerald-500 shadow-lg' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}>
                    <div className={`p-2 rounded-xl mr-4 border ${storage === ProjectStorageType.LOCAL_DRIVE ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-slate-800 text-slate-500 border-slate-700'}`}><HardDrive size={20} /></div>
                    <div className="text-left"><div className={`text-xs font-black uppercase ${storage === ProjectStorageType.LOCAL_DRIVE ? 'text-white' : 'text-slate-300'}`}>Local Drive</div><div className="text-[10px] text-slate-500 font-medium">Internal secure binary storage</div></div>
               </button>
               <button type="button" onClick={() => setStorage(ProjectStorageType.GOOGLE_DRIVE)} className={`flex items-center p-4 rounded-2xl border transition-all ${storage === ProjectStorageType.GOOGLE_DRIVE ? 'bg-blue-600/10 border-blue-500 shadow-lg' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}>
                    <div className={`p-2 rounded-xl mr-4 border ${storage === ProjectStorageType.GOOGLE_DRIVE ? 'bg-blue-500 text-white border-blue-400' : 'bg-slate-800 text-slate-500 border-slate-700'}`}><Cloud size={20} /></div>
                    <div className="text-left"><div className={`text-xs font-black uppercase ${storage === ProjectStorageType.GOOGLE_DRIVE ? 'text-white' : 'text-slate-300'}`}>Google Drive</div><div className="text-[10px] text-slate-500 font-medium">Remote cloud synchronization</div></div>
               </button>
            </div>
          </div>

          {storage === ProjectStorageType.GOOGLE_DRIVE && (
              <div className="bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6 space-y-4 animate-in slide-in-from-top-2 shadow-inner">
                  {!isDriveConnected ? (
                      <div className="flex flex-col items-center text-center space-y-4">
                          <p className="text-sm text-blue-200">Connect your Google account to provision the remote directory.</p>
                          <button type="button" onClick={handleConnectDrive} disabled={isDriveAuthLoading} className="bg-white hover:bg-gray-100 text-slate-900 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-3 shadow-xl transition-all active:scale-95">
                              {isDriveAuthLoading ? <Loader2 size={16} className="animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-4 h-4" alt=""/>}
                              Authorize Pipeline
                          </button>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <div className="flex items-center justify-between text-blue-300 border-b border-blue-500/20 pb-4">
                              <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> Identity: {connectedUser?.name}</span>
                              <button type="button" onClick={() => setIsDriveConnected(false)} className="text-[9px] font-black uppercase tracking-widest hover:text-white underline">Swap Token</button>
                          </div>
                          <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-1">Destination Directory</label>
                                <input type="text" placeholder="Folder Name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="w-full bg-slate-900 border border-blue-500/30 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner" />
                          </div>
                      </div>
                  )}
              </div>
          )}

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Inheritance Defaults</label>
            <div className="relative">
                <select value={defaultEngine} onChange={(e) => setDefaultEngine(e.target.value)} className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-xs font-bold">
                    {availableModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    <option value="other-model">External / Manual Integration</option>
                </select>
                <Bot size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
            </div>
          </div>

           <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">Aesthetic Palette</label>
            <div className="flex gap-4 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setSelectedColor(c)} className={`w-10 h-10 rounded-2xl border-4 transition-all focus:outline-none ${selectedColor === c ? 'border-white scale-110 shadow-xl' : 'border-transparent hover:scale-105 hover:border-slate-500'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="px-1 flex items-center gap-3">
              <label htmlFor="create-project-custom-color" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Custom Color</label>
              <input
                id="create-project-custom-color"
                type="color"
                value={pickerValue}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-10 w-14 rounded-xl border border-slate-700 bg-black cursor-pointer"
                aria-label="Pick custom project color"
              />
              <span className="text-[10px] font-mono text-slate-400 uppercase">{pickerValue}</span>
            </div>
          </div>
        </form>

        <div className="p-8 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-4 shrink-0">
          <button type="button" onClick={onClose} className="px-8 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Discard</button>
          <button onClick={handleSubmit} disabled={isSubmitting || !name.trim() || (storage === ProjectStorageType.GOOGLE_DRIVE && !isDriveConnected)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-12 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-950/40 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-3">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Provision Project
          </button>
        </div>
      </div>
    </div>
    {!api.drive.isReal() && <GoogleAuthMockModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={(e, n, a) => { setConnectedUser({email:e, name:n||'', avatar:a||''}); setShowAuthModal(false); }} />}
    {alertDialog}
    </>
  );
};

export default CreateProjectModal;
