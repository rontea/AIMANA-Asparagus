import React, { useMemo } from 'react';
import { Bot, Hash, Maximize2, Thermometer, Activity, Globe, Tag, Wand2, Image, Ban, Cpu, Compass, Fingerprint, Layers, Flower2, Box, ShieldCheck, Ghost, AudioLines, Sparkles, Sliders, GitMerge, ExternalLink } from 'lucide-react';
import { ModelOption } from '../../project/lab/ModelSelector/types';
import { getPrimaryModelCreditRate } from '../../../utils/pollenCredits';
import { getPrimaryGoogleApiRate } from '../../../utils/googleCredits';

interface SpecsDisplayProps {
    params: any;
    engine?: ModelOption;
    rawMetadata?: any;
    mediaType?: 'image' | 'video' | 'audio' | 'text';
    onOpenItemById?: (itemId: string) => void;
}

interface SpecItemProps {
    icon: React.ReactNode;
    label: string;
    value: any;
    colorClass?: string;
    isMono?: boolean;
}

const EXCLUDED_PARAM_KEYS = new Set([
    'prompt',
    'negativePrompt',
    'resolvedWidth',
    'resolvedHeight',
    'width',
    'height',
    'ratio',
    'aspectRatio',
    'dimensions',
    'ui_ratio_label',
    'engine_id',
    'isReference',
    'source',
    'iteration_source',
    'parent_revision',
    'engine_label',
    'timestamp',
    'auto_saved',
    'advanced_params',
    'dynamicParams',
    'title',
    'skipAutoSave',
    'sourceFileName',
    'pollenUsed',
    'googleUsage',
    'googleEstimatedCostUsd',
    'transcriptionPostProcess',
    'transcriptionHint',
    'referenceHash',
    'messages',
    'raw',
    'diagnostics',
    'verifiedResult'
]);

const HIDDEN_AUDIO_ROUTING_KEYS = new Set([
    'voiceName',
    'voice',
    'response_format',
    'multiSpeakerEnabled',
    'speakerOneName',
    'speakerOneVoice',
    'speakerTwoName',
    'speakerTwoVoice'
]);

const BINARY_PAYLOAD_KEYS = new Set([
    'audioData',
    'inputAudioData',
    'audioBase64',
    'inputImage',
    'image'
]);

const isBinaryLikeValue = (value: unknown) => (
    typeof value === 'string' && /^data:(image|audio|video)\//i.test(value)
);

const isRenderableArray = (value: unknown[]): boolean => (
    value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
);

const getSpecIcon = (key: string) => {
    const k = key.toLowerCase();
    if (k.includes('seed')) return <Hash size={12} />;
    if (k.includes('guidance') || k.includes('cfg')) return <Compass size={12} />;
    if (k.includes('temp')) return <Thermometer size={12} />;
    if (k.includes('motion')) return <Activity size={12} />;
    if (k.includes('enhance')) return <Wand2 size={12} />;
    if (k.includes('safe')) return <ShieldCheck size={12} />;
    if (k.includes('nologo')) return <Image size={12} />;
    if (k.includes('nofeed') || k.includes('ghost')) return <Ghost size={12} />;
    if (k.includes('pollen')) return <Flower2 size={12} />;
    if (k.includes('ratio')) return <Tag size={12} />;
    if (k.includes('audio')) return <AudioLines size={12} />;
    if (k.includes('step')) return <Sliders size={12} />;
    return <Fingerprint size={12} />;
};

const SpecRow: React.FC<SpecItemProps> = ({ icon, label, value, colorClass = "text-slate-300", isMono = true }) => {
    const renderValue = () => {
        if (typeof value === 'boolean') {
            return (
                <span className={value ? 'text-emerald-400' : 'text-slate-600'}>
                    {value ? 'ACTIVE' : 'OFF'}
                </span>
            );
        }

        if (Array.isArray(value)) {
            if (value.length === 0) return '[]';
            if (isRenderableArray(value)) return value.join(', ');
            return `${value.length} items`;
        }
        
        if (typeof value === 'object' && value !== null) {
            return <span className="text-slate-600 italic">Complex Data</span>;
        }

        return String(value);
    };

    return (
        <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 group/row">
            <div className="flex items-center gap-2.5">
                <div className="text-slate-500 group-hover/row:text-indigo-400 transition-colors shrink-0">
                    {icon}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label.replace(/_/g, ' ')}</span>
            </div>
            <div className={`text-[11px] font-bold text-right ml-4 ${isMono ? 'font-mono' : ''} ${colorClass}`}>
                {renderValue()}
            </div>
        </div>
    );
};

export const SpecsDisplay: React.FC<SpecsDisplayProps> = ({ params, engine, rawMetadata, mediaType, onOpenItemById }) => {
    const isReference = params?.isReference || rawMetadata?.source === 'reference_upload' || params?.engine_id === 'reference';
    const specColor = isReference ? 'bg-emerald-500' : (engine?.color.replace('text-', 'bg-') || 'bg-indigo-500');
    const isNegativeContextApplicable = mediaType === 'image' || mediaType === 'video' || !mediaType;

    const combinedParams = useMemo(() => {
        if (!params) return {};
        const base = { ...params };
        const nested = base.advanced_params || base.dynamicParams || {};
        return { ...base, ...nested };
    }, [params]);

    const resolutionValue = useMemo(() => {
        const width = Number(combinedParams?.resolvedWidth ?? combinedParams?.width ?? 0);
        const height = Number(combinedParams?.resolvedHeight ?? combinedParams?.height ?? 0);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
        return `${width}x${height}`;
    }, [combinedParams]);

    const aspectValue = useMemo(() => {
        const raw = String(combinedParams?.ratio ?? combinedParams?.aspectRatio ?? '').trim();
        return raw ? raw.toUpperCase() : '';
    }, [combinedParams]);
    
    const extraParams = useMemo(() => {
        return Object.entries(combinedParams).filter(([key, value]) => {
            if (EXCLUDED_PARAM_KEYS.has(key)) return false;
            if ((mediaType === 'audio' || mediaType === 'text') && HIDDEN_AUDIO_ROUTING_KEYS.has(key)) return false;
            if (BINARY_PAYLOAD_KEYS.has(key)) return false;
            if (value === undefined || value === null || value === '') return false;
            if (isBinaryLikeValue(value)) return false;
            return true;
        });
    }, [combinedParams, mediaType]);

    const primaryPollenRate = useMemo(() => getPrimaryModelCreditRate(engine), [engine]);
    const primaryGoogleRate = useMemo(() => getPrimaryGoogleApiRate(engine), [engine]);
    const mergeInfo = useMemo(() => {
        const fromCombined = combinedParams?.mergeInfo;
        const fromRaw = rawMetadata?.mergeInfo || rawMetadata?.advanced_params?.mergeInfo;
        const source = fromCombined && typeof fromCombined === 'object' ? fromCombined : fromRaw;
        if (!source || typeof source !== 'object') return null;

        const roleRaw = String((source as any).role || '').toLowerCase();
        const role = roleRaw === 'main' || roleRaw === 'revision' ? roleRaw : null;
        const mainItemIdRaw = (source as any).mainItemId;
        const mainItemId = typeof mainItemIdRaw === 'string' && mainItemIdRaw.trim() ? mainItemIdRaw.trim() : '';
        if (!role || !mainItemId) return null;

        const mergedItemIdsRaw = (source as any).mergedItemIds;
        const mergedItemIds = Array.isArray(mergedItemIdsRaw)
            ? mergedItemIdsRaw.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
            : [];

        return {
            role,
            mainItemId,
            mergedCount: mergedItemIds.length
        };
    }, [combinedParams, rawMetadata]);

    return (
        <div className="space-y-6 animate-in slide-in-from-top-2 fade-in">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-inner">
                <div className={`p-3 rounded-xl ${specColor} bg-opacity-10 ${isReference ? 'text-emerald-400' : (engine?.color || 'text-indigo-400')} border border-white/5`}>
                    {isReference ? <Box size={20} /> : engine ? <engine.icon size={20} /> : <Bot size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-white truncate uppercase tracking-tight">
                        {isReference ? 'Neural Reference Source' : (engine?.label || rawMetadata?.engine_label || combinedParams?.engine_id || 'Neural Node')}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Protocol:</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${isReference ? 'bg-emerald-500/10 text-emerald-400' : ((engine?.provider === 'pollinations' || combinedParams?.engine_id?.includes('pollination')) ? 'bg-cyan-500/10 text-cyan-400' : 'bg-indigo-500/10 text-indigo-400')}`}>
                            {isReference ? 'Manual Ingest' : (engine?.provider || rawMetadata?.engine_category || 'Inference Gateway')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-1">
                <div className="px-1 mb-3">
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                        <Fingerprint size={10} className="text-indigo-500" /> Captured Controls
                    </h4>
                </div>
                
                <div className="bg-black/20 rounded-2xl border border-white/5 p-4 py-1">
                    {primaryPollenRate && (
                        <SpecRow
                            icon={<Flower2 size={12} />}
                            label="Rate"
                            value={primaryPollenRate.displayValue}
                            colorClass="text-emerald-300"
                            isMono={false}
                        />
                    )}
                    {primaryGoogleRate && (
                        <SpecRow
                            icon={<Cpu size={12} />}
                            label="Rate"
                            value={primaryGoogleRate.displayValue}
                            colorClass="text-indigo-300"
                            isMono={false}
                        />
                    )}
                    {resolutionValue && (
                        <SpecRow icon={<Maximize2 size={12}/>} label="Resolution" value={resolutionValue} />
                    )}
                    {aspectValue && (
                        <SpecRow icon={<Tag size={12}/>} label="Aspect" value={aspectValue} colorClass="text-slate-400" />
                    )}
                    {extraParams.map(([key, value]) => (
                        <SpecRow 
                            key={key}
                            icon={getSpecIcon(key)}
                            label={key}
                            value={value}
                            colorClass={typeof value === 'number' ? 'text-indigo-400' : 'text-slate-300'}
                        />
                    ))}
                </div>
            </div>

            {mergeInfo && (
                <div className="space-y-3">
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 flex items-center gap-2">
                        <GitMerge size={10} className="text-cyan-400" /> Merge Information
                    </h4>
                    <div className="p-4 bg-cyan-950/10 border border-cyan-900/20 rounded-2xl space-y-2.5">
                        <SpecRow
                            icon={<GitMerge size={12} />}
                            label="Merge Status"
                            value={mergeInfo.role === 'main' ? 'Main Merge' : 'Merge with Main'}
                            colorClass="text-cyan-300"
                            isMono={false}
                        />
                        <SpecRow
                            icon={<Fingerprint size={12} />}
                            label="Main Item"
                            value={mergeInfo.mainItemId}
                            colorClass="text-slate-300"
                        />
                        {mergeInfo.role === 'main' && mergeInfo.mergedCount > 0 && (
                            <SpecRow
                                icon={<Layers size={12} />}
                                label="Merged Items"
                                value={mergeInfo.mergedCount}
                                colorClass="text-cyan-300"
                            />
                        )}
                        {onOpenItemById && (
                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={() => onOpenItemById(mergeInfo.mainItemId)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-[10px] font-black uppercase tracking-widest transition-all"
                                    title="Open Main Merge item"
                                >
                                    <ExternalLink size={11} />
                                    Open Main
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(!isNegativeContextApplicable || combinedParams?.negativePrompt) && (
                <div className="space-y-3">
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 flex items-center gap-2">
                        <Ban size={10} className="text-red-500" /> Negative Context
                    </h4>
                    <div className="p-4 bg-red-950/10 border border-red-900/20 rounded-2xl">
                        {isNegativeContextApplicable ? (
                            <p className="text-[11px] text-slate-400 italic leading-relaxed">
                                {combinedParams.negativePrompt}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                                    N/A
                                </p>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    Negative context is not applicable for {mediaType} artifacts.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
