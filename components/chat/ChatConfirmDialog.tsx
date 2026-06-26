import React from 'react';
import { ConfirmDialogState } from './types';

interface ChatConfirmDialogProps {
    confirmDialog: ConfirmDialogState;
    confirmCancelRef: React.MutableRefObject<HTMLButtonElement | null>;
    confirmActionRef: React.MutableRefObject<HTMLButtonElement | null>;
    onClose: () => void;
    onConfirm: () => void;
}

const ChatConfirmDialog: React.FC<ChatConfirmDialogProps> = ({
    confirmDialog,
    confirmCancelRef,
    confirmActionRef,
    onClose,
    onConfirm
}) => (
    <div className="absolute inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-confirm-title"
            aria-describedby="chat-confirm-description"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        >
            <div className="p-5 border-b border-slate-800">
                <h3 id="chat-confirm-title" className="text-sm font-black uppercase tracking-widest text-white">{confirmDialog.title}</h3>
                <p id="chat-confirm-description" className="mt-2 text-xs text-slate-400">{confirmDialog.description}</p>
            </div>
            <div className="p-4 flex items-center justify-end gap-2">
                <button
                    ref={confirmCancelRef}
                    onClick={onClose}
                    className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 text-xs font-bold"
                >
                    Cancel
                </button>
                <button
                    ref={confirmActionRef}
                    onClick={onConfirm}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 ${
                        confirmDialog.tone === 'danger'
                            ? 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-500/50'
                            : 'bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-500/50'
                    }`}
                >
                    {confirmDialog.confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

export default ChatConfirmDialog;
