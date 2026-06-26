import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, HardDrive, Loader2, Save, X } from 'lucide-react';
import { ProjectStorageType } from '../../types';
import { api } from '../../services/api';

export interface PromptCollectionCreateInput {
  name: string;
  description: string;
  storageType: ProjectStorageType;
  color: string;
  driveFolderId?: string;
}

interface PromptCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: PromptCollectionCreateInput) => Promise<void>;
}

const COLLECTION_COLORS = [
  '#1e293b',
  '#334155',
  '#4c1d95',
  '#881337',
  '#14532d',
  '#1e3a8a',
  '#7c2d12',
  '#f59e0b'
];

const storageCardClass = (active: boolean, accentClass: string) => (
  `w-full rounded-2xl border p-4 text-left transition-all ${
    active
      ? `${accentClass} shadow-[0_20px_50px_rgba(2,6,23,0.45)]`
      : 'border-slate-700/60 bg-slate-900/65 hover:border-slate-500/60'
  }`
);

export const PromptCollectionModal: React.FC<PromptCollectionModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [storageType, setStorageType] = useState<ProjectStorageType>(ProjectStorageType.LOCAL_DRIVE);
  const [color, setColor] = useState(COLLECTION_COLORS[0]);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setStorageType(ProjectStorageType.LOCAL_DRIVE);
    setColor(COLLECTION_COLORS[0]);
    setNewFolderName('');
    setIsDriveConnected(false);
    setIsConnectingDrive(false);
    setIsSubmitting(false);
    setTouched(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!name.trim()) return;
    setNewFolderName(name.trim());
  }, [isOpen, name]);

  const isNameInvalid = touched && !name.trim();
  const isSubmitDisabled = isSubmitting
    || !name.trim()
    || (storageType === ProjectStorageType.GOOGLE_DRIVE && !isDriveConnected);

  const selectedStorageDetail = useMemo(() => {
    if (storageType === ProjectStorageType.GOOGLE_DRIVE) {
      return 'Remote cloud synchronization';
    }
    return 'Internal secure binary storage';
  }, [storageType]);

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      await api.drive.authorize();
      setIsDriveConnected(true);
    } catch (error) {
      setIsDriveConnected(false);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    if (storageType === ProjectStorageType.GOOGLE_DRIVE && !isDriveConnected) return;

    setIsSubmitting(true);
    try {
      let driveFolderId: string | undefined;
      if (storageType === ProjectStorageType.GOOGLE_DRIVE) {
        const folderName = newFolderName.trim() || name.trim();
        const createdFolder = await api.drive.createFolder(folderName);
        driveFolderId = createdFolder.id;
      }

      await onCreate({
        name: name.trim(),
        description: description.trim(),
        storageType,
        color,
        driveFolderId
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xl">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900 shadow-[0_30px_90px_rgba(2,6,23,0.75)]">
        <div className="border-b border-slate-800 bg-slate-800/50 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Prompt Collection</h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">
                Provisioning New Workspace
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
          <div className="overflow-y-auto px-8 py-8 custom-scrollbar">
          <section className="space-y-4">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Neural Metadata</p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Workspace Name (e.g. Marketing Q4)"
              className={`w-full rounded-xl border bg-slate-800 px-4 py-3.5 text-white placeholder:text-slate-500 outline-none transition-all ${
                isNameInvalid
                  ? 'border-red-500/60 focus:ring-2 focus:ring-red-500/20'
                  : 'border-slate-700/60 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/25'
              }`}
              autoFocus
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Technical notes or project scope details..."
              className="h-24 w-full resize-none rounded-xl border border-slate-700/60 bg-slate-800 px-4 py-3.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/25"
            />
          </section>

          <section className="mt-8 space-y-4">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Infrastructure Layer (Storage)</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStorageType(ProjectStorageType.LOCAL_DRIVE)}
                className={storageCardClass(
                  storageType === ProjectStorageType.LOCAL_DRIVE,
                  'border-emerald-400/80 bg-[#05293a]'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 p-2.5 text-emerald-300">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-tight text-white">Local Drive</div>
                    <div className="mt-1 text-[10px] font-medium text-slate-400">Internal secure binary storage</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStorageType(ProjectStorageType.GOOGLE_DRIVE)}
                className={storageCardClass(
                  storageType === ProjectStorageType.GOOGLE_DRIVE,
                  'border-blue-400/70 bg-[#0b1e45]'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-xl border border-blue-400/40 bg-blue-500/20 p-2.5 text-blue-300">
                    <Cloud size={20} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-tight text-white">Google Drive</div>
                    <div className="mt-1 text-[10px] font-medium text-slate-400">Remote cloud synchronization</div>
                  </div>
                </div>
              </button>

            </div>

            {storageType === ProjectStorageType.GOOGLE_DRIVE && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5">
                {!isDriveConnected ? (
                  <button
                    type="button"
                    onClick={handleConnectDrive}
                    disabled={isConnectingDrive}
                    className="inline-flex items-center gap-3 rounded-xl border border-blue-400/45 bg-blue-500/20 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-blue-100 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
                  >
                    {isConnectingDrive ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
                    Connect Google Drive
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Connected</p>
                    <input
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder="Drive folder name"
                      className="w-full rounded-xl border border-blue-500/35 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-white placeholder:text-slate-500 outline-none focus:border-blue-400/80"
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="mt-8 space-y-4">
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Aesthetic Palette</p>
            <div className="flex flex-wrap gap-3">
              {COLLECTION_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-10 w-10 rounded-2xl border-4 transition-all ${
                    color === swatch
                      ? 'scale-110 border-white'
                      : 'border-transparent hover:scale-105 hover:border-slate-500'
                  }`}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Select color ${swatch}`}
                />
              ))}
            </div>
          </section>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-800/50 px-8 py-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Storage: {selectedStorageDetail}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-white"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="inline-flex items-center gap-3 rounded-2xl border border-indigo-400/45 bg-indigo-600 px-8 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-indigo-950/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Provision Collection
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
