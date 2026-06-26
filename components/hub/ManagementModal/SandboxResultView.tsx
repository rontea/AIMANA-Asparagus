import React from 'react';
import { Beaker } from 'lucide-react';

interface SandboxResultViewProps {
    result: any;
    isLoading: boolean;
}

export const SandboxResultView: React.FC<SandboxResultViewProps> = ({ result, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center gap-4 text-indigo-400">
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">Retrieving Artifact...</span>
            </div>
        );
    }

    if (result) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center">
                {result.type === 'binary' ? (
                    result.mimeType.includes('video') ? 
                        <video src={result.url} className="max-w-full max-h-full rounded-xl shadow-2xl" controls autoPlay loop muted /> :
                        result.mimeType.includes('audio') ? 
                            <audio src={result.url} className="w-full" controls /> :
                            <img src={result.url} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" alt="Sandbox result" />
                ) : (
                    <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-y-auto font-mono text-[10px] text-emerald-400 max-h-full">
                        <pre className="whitespace-pre-wrap">{result.content}</pre>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="text-slate-700 flex flex-col items-center gap-3">
            <Beaker size={48} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Results will appear here</p>
        </div>
    );
};
