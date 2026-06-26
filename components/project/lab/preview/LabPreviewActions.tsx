import React from 'react';
import { Download, Plus, Loader2 } from 'lucide-react';
import { GeneratedImageResult } from '../../../../services/geminiService';
import { ModelOption } from '../ModelSelectorModal';

interface LabPreviewActionsProps {
    result: GeneratedImageResult;
    prompt: string;
    modelData?: ModelOption;
    onSave: () => void;
    isSaving: boolean;
}

export const LabPreviewActions: React.FC<LabPreviewActionsProps> = ({
    result, prompt, modelData, onSave, isSaving
}) => {
    const isVideo = result.mimeType.startsWith('video/');
    const isAudio = result.mimeType.startsWith('audio/') || result.audioBuffer !== undefined;
    const audioExt = result.mimeType.startsWith('audio/')
        ? result.mimeType.split('/')[1]?.split(';')[0] || 'mp3'
        : 'mp3';

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = `data:${result.mimeType};base64,${result.base64}`;
        link.download = `AIMANA_LAB_${Date.now()}.${isVideo ? 'mp4' : isAudio ? audioExt : 'png'}`;
        link.click();
    };

    return (
        <div className="px-12 py-8 bg-slate-900/80 backdrop-blur-xl border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 shrink-0 z-30">
            <div className="flex-1 min-w-0 text-left w-full">
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border border-white/10 ${modelData?.color || 'text-indigo-400'}`}>
                        {modelData?.label}
                    </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 italic opacity-80">"{prompt}"</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <button onClick={handleDownload} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/5 shadow-xl transition-all">
                    <Download size={16} /> Download
                </button>
                <button onClick={onSave} disabled={isSaving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-2xl shadow-indigo-900/40 transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Capture In Project
                </button>
            </div>
        </div>
    );
};
