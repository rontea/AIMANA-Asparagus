import React from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { ChatContext } from './types';

interface ChatHeaderProps {
    context: ChatContext;
    onBack: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ context, onBack }) => (
    <div className="relative min-h-16 md:min-h-20 flex items-center justify-between px-3 sm:px-5 md:px-8 py-3 border-b border-slate-800/70 shrink-0 bg-slate-900/20 z-30">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4 md:gap-6">
            <button
                onClick={onBack}
                className="chat-focus-ring shrink-0 text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-widest group rounded-md"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">{context.source === 'project' ? 'Back' : 'Generate Content'}</span>
            </button>
            <div className="h-5 w-px bg-slate-800 hidden sm:block" />
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:gap-4">
                <div className="shrink-0 p-2 rounded-xl chat-token-card-active">
                    <Sparkles size={16} className="text-indigo-400" />
                </div>
                <div className="min-w-0">
                    <h2 className="truncate text-[10px] md:text-xs font-black text-white uppercase tracking-[0.18em] sm:tracking-[0.2em] md:tracking-[0.3em]">AI Chat Runtime</h2>
                    <p className="truncate text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-[0.2em] sm:tracking-widest">Conversation Workspace</p>
                </div>
            </div>
        </div>
    </div>
);

export default ChatHeader;
