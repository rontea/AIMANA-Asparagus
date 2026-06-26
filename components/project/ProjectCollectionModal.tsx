import React, { useEffect, useState } from 'react';
import { FolderPlus, Loader2, X } from 'lucide-react';

interface ProjectCollectionModalProps {
    isOpen: boolean;
    isSubmitting?: boolean;
    mode?: 'create' | 'edit';
    initialName?: string;
    initialDescription?: string;
    onClose: () => void;
    onSubmit: (name: string, description: string) => Promise<void> | void;
}

export const ProjectCollectionModal: React.FC<ProjectCollectionModalProps> = ({
    isOpen,
    isSubmitting = false,
    mode = 'create',
    initialName = '',
    initialDescription = '',
    onClose,
    onSubmit
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setName('');
            setDescription('');
            return;
        }
        setName(initialName || '');
        setDescription((initialDescription || '').slice(0, 300));
    }, [initialDescription, initialName, isOpen]);

    if (!isOpen) return null;

    const isEditMode = mode === 'edit';

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-950 p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">
                            <FolderPlus size={14} />
                            {isEditMode ? 'Edit Collection' : 'New Collection'}
                        </div>
                        <h2 className="mt-3 text-2xl font-black tracking-tight text-white">{isEditMode ? 'Collection Settings' : 'Create Collection'}</h2>
                        <p className="mt-2 text-sm text-slate-400">
                            {isEditMode
                                ? 'Update the title and short details shown in the collection header.'
                                : 'Collections act like second-level folders inside this project.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="rounded-xl border border-slate-700 p-2 text-slate-500 transition-colors hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form
                    className="mt-6 space-y-5"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!name.trim() || isSubmitting) return;
                        await onSubmit(name.trim(), description.trim().slice(0, 300));
                    }}
                >
                    <label className="block">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Collection Name</span>
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Active Assets / Campaign 01"
                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                    </label>

                    {isEditMode && (
                        <label className="block">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Collection Details</span>
                                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">{description.length}/300</span>
                            </div>
                            <textarea
                                value={description}
                                maxLength={300}
                                onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                                placeholder="Add a short description for this collection..."
                                rows={5}
                                className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none transition-colors focus:border-indigo-500"
                            />
                        </label>
                    )}

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || isSubmitting}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {isEditMode ? 'Save Settings' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
