import React, { useMemo, useState } from 'react';
import { FolderInput, Loader2, X } from 'lucide-react';
import { ProjectCollection } from '../../types';

interface ProjectCollectionAssignModalProps {
    isOpen: boolean;
    collections: ProjectCollection[];
    itemCount?: number;
    initialCollectionId?: string | null;
    isSubmitting?: boolean;
    includeRootOption?: boolean;
    title?: string;
    description?: string;
    helperNote?: string;
    confirmLabel?: string;
    onClose: () => void;
    onConfirm: (collectionId: string | null) => Promise<void> | void;
}

export const ProjectCollectionAssignModal: React.FC<ProjectCollectionAssignModalProps> = ({
    isOpen,
    collections,
    itemCount = 1,
    initialCollectionId = null,
    isSubmitting = false,
    includeRootOption = true,
    title = 'Move to Collection',
    description = `Choose where to place ${itemCount} asset${itemCount === 1 ? '' : 's'} inside this project.`,
    helperNote,
    confirmLabel = 'Move',
    onClose,
    onConfirm
}) => {
    const [selectedId, setSelectedId] = useState<string>(initialCollectionId || '');

    React.useEffect(() => {
        if (isOpen) setSelectedId(initialCollectionId || '');
    }, [initialCollectionId, isOpen]);

    const collectionOptions = useMemo(
        () => collections.slice().sort((a, b) => a.name.localeCompare(b.name)),
        [collections]
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[2rem] border border-slate-700 bg-slate-950 p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">
                            <FolderInput size={14} />
                            Assign Collection
                        </div>
                        <h2 className="mt-3 text-2xl font-black tracking-tight text-white">{title}</h2>
                        <p className="mt-2 text-sm text-slate-400">{description}</p>
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

                <div className="mt-6 space-y-3">
                    {helperNote && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                            {helperNote}
                        </div>
                    )}
                    {includeRootOption && (
                        <button
                            type="button"
                            onClick={() => setSelectedId('')}
                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                                selectedId === ''
                                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            <div>
                                <div className="text-sm font-semibold">Project Root</div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">No collection</div>
                            </div>
                        </button>
                    )}

                    {collectionOptions.map((collection) => (
                        <button
                            key={collection.id}
                            type="button"
                            onClick={() => setSelectedId(collection.id)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                                selectedId === collection.id
                                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            <div>
                                <div className="text-sm font-semibold">{collection.name}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                    {collection.itemCount} total assets
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={async () => onConfirm(selectedId || null)}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
