import React, { useEffect, useState } from 'react';
import { Check, History, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { ChatSession } from './types';

interface ChatSessionPanelProps {
    isSessionPanelOpen: boolean;
    setIsSessionPanelOpen: (open: boolean) => void;
    sessions: ChatSession[];
    activeSessionId: string;
    setActiveSessionId: (sessionId: string) => void;
    handleDeleteSession: (sessionId: string) => void;
    handleRenameSession: (sessionId: string, nextTitle: string) => void;
    isSending: boolean;
    handleCreateSession: () => void;
    handleMoveSessionToProject: (sessionId: string) => void;
    isCapturing: boolean;
}

const ChatSessionPanel: React.FC<ChatSessionPanelProps> = ({
    isSessionPanelOpen,
    setIsSessionPanelOpen,
    sessions,
    activeSessionId,
    setActiveSessionId,
    handleDeleteSession,
    handleRenameSession,
    isSending,
    handleCreateSession,
    handleMoveSessionToProject,
    isCapturing
}) => {
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');

    useEffect(() => {
        if (!editingSessionId) return;
        if (!sessions.some((s) => s.id === editingSessionId)) {
            setEditingSessionId(null);
            setEditingTitle('');
        }
    }, [editingSessionId, sessions]);

    const beginEdit = (session: ChatSession) => {
        if (isSending) return;
        setEditingSessionId(session.id);
        setEditingTitle(session.title || '');
    };

    const cancelEdit = () => {
        setEditingSessionId(null);
        setEditingTitle('');
    };

    const commitEdit = () => {
        if (!editingSessionId) return;
        handleRenameSession(editingSessionId, editingTitle);
        cancelEdit();
    };

    return (
        <>
            {isSessionPanelOpen && (
                <button
                    onClick={() => setIsSessionPanelOpen(false)}
                    disabled={isSending}
                    className="absolute inset-0 z-10 bg-black/40 lg:hidden"
                    aria-label="Close sessions panel"
                />
            )}
            <aside id="chat-session-panel" className={`absolute right-0 top-0 h-full w-full sm:w-[92vw] max-w-96 lg:w-96 border-l border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-2xl z-20 chat-motion-panel flex flex-col min-h-0 ${isSessionPanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md flex items-center justify-between shrink-0">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <History size={16} className="text-indigo-400" />
                        Session History
                    </h2>
                    <button
                        onClick={() => setIsSessionPanelOpen(false)}
                        disabled={isSending}
                        className="chat-focus-ring p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Hide sessions"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2 mt-1">
                        Recent Sessions
                    </div>
                    <div className="space-y-3">
                            {sessions.map((session) => {
                                const isActive = session.id === activeSessionId;
                                const isEditing = editingSessionId === session.id;
                                return (
                                    <div
                                        key={session.id}
                                        className={`w-full text-left p-4 transition-all group relative flex items-start justify-between overflow-hidden rounded-2xl border ${
                                            isActive
                                                ? 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 shadow-sm'
                                                : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        {isActive ? (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                                        ) : null}
                                        <button
                                            onClick={() => setActiveSessionId(session.id)}
                                            disabled={isSending || isEditing}
                                            className="chat-focus-ring flex-1 min-w-0 text-left rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                                            aria-current={isActive ? 'true' : undefined}
                                        >
                                            <div className={`pr-16 min-w-0 ${isActive ? 'pl-2' : ''}`}>
                                            {isEditing ? (
                                                <input
                                                    value={editingTitle}
                                                    onChange={(e) => setEditingTitle(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            commitEdit();
                                                        } else if (e.key === 'Escape') {
                                                            e.preventDefault();
                                                            cancelEdit();
                                                        }
                                                    }}
                                                    onBlur={commitEdit}
                                                    autoFocus
                                                    className="w-full bg-slate-900 border border-indigo-500/40 rounded-md px-2 py-1 text-sm font-bold text-indigo-100 outline-none"
                                                    aria-label="Edit session title"
                                                />
                                            ) : (
                                                <p className={`text-sm font-bold truncate ${isActive ? 'text-indigo-100' : 'text-slate-300 group-hover:text-white'}`}>
                                                    {session.title}
                                                </p>
                                            )}
                                            <p className={`text-[10px] mt-1.5 font-mono truncate ${isActive ? 'text-indigo-400/60' : 'text-slate-500'}`}>
                                                {new Date(session.updatedAt).toLocaleString()}
                                            </p>
                                            </div>
                                        </button>
                                        <div className={`shrink-0 flex items-center gap-1 ${isEditing ? '' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'} transition-opacity static sm:absolute right-2 top-3 bg-slate-900/80 backdrop-blur-sm p-1 rounded-lg ml-3`}>
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={commitEdit}
                                                        disabled={isSending}
                                                        className="chat-focus-ring p-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl border border-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Save title"
                                                        aria-label="Save session title"
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={cancelEdit}
                                                        disabled={isSending}
                                                        className="chat-focus-ring p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Cancel edit"
                                                        aria-label="Cancel editing session title"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => beginEdit(session)}
                                                    disabled={isSending}
                                                    className="chat-focus-ring p-2 text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl border border-slate-700/50 hover:border-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    title="Rename session"
                                                    aria-label="Rename session"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleMoveSessionToProject(session.id)}
                                                disabled={isSending || isCapturing || session.messages.length === 0}
                                                className="chat-focus-ring p-2 text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                title="Move to project"
                                                aria-label="Move session to project"
                                            >
                                                <Save size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSession(session.id)}
                                                disabled={isSending}
                                                className="chat-focus-ring p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-slate-700/50 hover:border-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                title="Delete session"
                                                aria-label="Delete session"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    <button
                        onClick={handleCreateSession}
                        disabled={isSending}
                        className="chat-focus-ring w-full mt-4 py-3.5 rounded-2xl border border-slate-800 border-dashed hover:border-slate-600 hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus size={14} /> New Session
                    </button>
                </div>
            </aside>
        </>
    );
};

export default ChatSessionPanel;
