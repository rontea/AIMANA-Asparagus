import React, { useState } from 'react';
import { Braces, Zap, Loader2, Key, Eye, EyeOff, Info, Shield, Server, CheckCircle2 } from 'lucide-react';

interface NetworkTabProps {
    formData: any;
    setFormData: (data: any) => void;
    onValidate: () => void;
    isTesting: boolean;
    onApplyPollinationsStarter?: (starterId: 'pollinations-image' | 'pollinations-video' | 'pollinations-chat' | 'pollinations-audio') => void;
}

const POLLINATIONS_STARTERS = [
    {
        id: 'pollinations-image',
        label: 'Image (URL)',
        description: 'GET /image/{prompt} with URL query controls',
        apply: (formData: any) => ({
            ...formData,
            provider: 'pollinations',
            upstreamId: formData.upstreamId || 'flux',
            requestMethod: 'GET',
            requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model={{upstreamId}}&width={{width}}&height={{height}}&seed={{seed}}&nologo={{nologo}}&enhance={{enhance}}&safe={{safe}}&private={{private}}&nofeed={{nofeed}}&quality={{quality}}&transparent={{transparent}}&negative_prompt={{negative_prompt}}',
            requestHeaders: '{"Accept":"image/*"}',
            requestBodyTemplate: '',
            responsePath: ''
        })
    },
    {
        id: 'pollinations-video',
        label: 'Video (URL)',
        description: 'GET /video/{prompt} with duration, aspectRatio, image, and audio controls',
        apply: (formData: any) => ({
            ...formData,
            provider: 'pollinations',
            upstreamId: formData.upstreamId || 'veo',
            requestMethod: 'GET',
            requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model={{upstreamId}}&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
            requestHeaders: '{"Accept":"video/*"}',
            requestBodyTemplate: '',
            responsePath: ''
        })
    },
    {
        id: 'pollinations-chat',
        label: 'Chat (JSON)',
        description: 'POST /v1/chat/completions (OpenAI-compatible)',
        apply: (formData: any) => ({
            ...formData,
            provider: 'pollinations',
            upstreamId: formData.upstreamId || 'openai',
            requestMethod: 'POST',
            requestUrl: 'https://gen.pollinations.ai/v1/chat/completions',
            requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
            requestBodyTemplate: '{"model":"{{upstreamId}}","messages":[{"role":"system","content":{{system_json}}},{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"max_tokens":{{max_tokens}},"stream":false}',
            responsePath: 'choices.0.message.content'
        })
    },
    {
        id: 'pollinations-audio',
        label: 'Audio (TTS)',
        description: 'POST /v1/audio/speech',
        apply: (formData: any) => ({
            ...formData,
            provider: 'pollinations',
            upstreamId: formData.upstreamId || 'tts-1',
            requestMethod: 'POST',
            requestUrl: 'https://gen.pollinations.ai/v1/audio/speech',
            requestHeaders: '{"Accept":"audio/mpeg","Content-Type":"application/json"}',
            requestBodyTemplate: '{"model":"{{upstreamId}}","input":{{prompt_json}},"voice":"{{voiceName}}","response_format":"mp3"}',
            responsePath: ''
        })
    }
];

export const NetworkTab: React.FC<NetworkTabProps> = ({ formData, setFormData, onValidate, isTesting, onApplyPollinationsStarter }) => {
    const [showKey, setShowKey] = useState(false);

    // Logic to determine active secret origin
    const isSystemProvider = formData.provider === 'google' || formData.provider === 'pollinations' || formData.provider === 'nvidia';
    const usesSystemKey = !!formData.isSystem || (isSystemProvider && !formData.apiKey);
    const usesForgedKey = !formData.isSystem && !!formData.isProgrammable;

    return (
        <div className="space-y-8 animate-in slide-in-from-left-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl">
                <div className="flex items-start gap-4">
                    <Braces className="text-indigo-400 shrink-0 mt-1" size={24} />
                    <div className="space-y-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Network Orchestration</h4>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
                            Define the programmable logic for this neural endpoint. Use <code className="text-indigo-400 font-bold">{"{{prompt}}"}</code>, <code className="text-indigo-400 font-bold">{"{{width}}"}</code>, and <code className="text-indigo-400 font-bold">{"{{seed}}"}</code> as dynamic placeholders.
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onValidate}
                    disabled={isTesting || !formData.requestUrl}
                    className="group flex items-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-900/40 active:scale-95 disabled:opacity-50"
                >
                    {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="group-hover:animate-pulse" />}
                    {isTesting ? 'Validating...' : 'Check Connection'}
                </button>
            </div>

            {/* Secret Management Origin Guide with Green/Gray Logic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-2xl flex items-start gap-3 border transition-all ${
                    usesSystemKey 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-slate-900/40 border-slate-800 opacity-40'
                }`}>
                    <div className={`p-2 rounded-xl ${usesSystemKey ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-600'}`}>
                        <Server size={14} />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <h5 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${usesSystemKey ? 'text-emerald-400' : 'text-slate-500'}`}>Global System Keys</h5>
                            {usesSystemKey && <CheckCircle2 size={10} className="text-emerald-400" />}
                        </div>
                        <p className={`text-[9px] leading-relaxed ${usesSystemKey ? 'text-emerald-100/60' : 'text-slate-600'}`}>
                            Native integrations (Gemini, Pollinations, NVIDIA) use keys defined in the server <code className="font-bold">.env</code>. Manual entry is suppressed.
                        </p>
                    </div>
                </div>

                <div className={`p-4 rounded-2xl flex items-start gap-3 border transition-all ${
                    usesForgedKey 
                    ? 'bg-indigo-500/10 border-indigo-500/30' 
                    : 'bg-slate-900/40 border-slate-800 opacity-40'
                }`}>
                    <div className={`p-2 rounded-xl ${usesForgedKey ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-600'}`}>
                        <Shield size={14} />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <h5 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${usesForgedKey ? 'text-indigo-400' : 'text-slate-500'}`}>Forged Token Access</h5>
                            {usesForgedKey && <CheckCircle2 size={10} className="text-indigo-400" />}
                        </div>
                        <p className={`text-[9px] leading-relaxed ${usesForgedKey ? 'text-indigo-100/60' : 'text-slate-600'}`}>
                            Use for custom API endpoints. Inject into templates using the <code className="font-bold">{"{{api_key}}"}</code> variable.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Pollinations Starter Profiles</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {POLLINATIONS_STARTERS.map((starter) => (
                        <button
                            key={starter.id}
                            type="button"
                            onClick={() => {
                                if (onApplyPollinationsStarter) {
                                    onApplyPollinationsStarter(starter.id as 'pollinations-image' | 'pollinations-video' | 'pollinations-chat' | 'pollinations-audio');
                                } else {
                                    setFormData(starter.apply(formData));
                                }
                            }}
                            className="text-left p-3 rounded-xl border border-slate-800 bg-black/40 hover:border-indigo-500/40 hover:bg-indigo-600/10 transition-all"
                        >
                            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{starter.label}</div>
                            <div className="text-[9px] text-slate-500 mt-1">{starter.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Authentication Section */}
            <div className={`p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-inner transition-opacity ${!usesForgedKey ? 'opacity-50 grayscale-[0.2]' : ''}`}>
                <div className="flex items-center justify-between">
                    <label htmlFor="neural-engine-token-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                        <Key size={12} className={usesForgedKey ? "text-amber-400" : "text-slate-600"} /> Neural Access Token (Forged Key)
                    </label>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${usesForgedKey ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-slate-800 border-slate-700'}`}>
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${usesForgedKey ? 'text-indigo-400' : 'text-slate-600'}`}>Binding:</span>
                        <code className={`text-[9px] font-mono ${usesForgedKey ? 'text-indigo-300' : 'text-slate-600'}`}>{"{{api_key}}"}</code>
                    </div>
                </div>
                <div className="relative group">
                    <input 
                        id="neural-engine-token-input"
                        name="aimana_secret_neural_token_no_fill"
                        type={showKey ? "text" : "password"}
                        value={formData.apiKey || ''} 
                        onChange={e => setFormData({...formData, apiKey: e.target.value})} 
                        autoComplete="new-password"
                        disabled={usesSystemKey}
                        className={`w-full bg-black border rounded-xl pl-4 pr-12 py-3 text-sm font-mono outline-none transition-all placeholder:text-slate-800 ${
                            usesSystemKey 
                            ? 'border-slate-800 text-slate-600 cursor-not-allowed bg-slate-950/50' 
                            : 'border-slate-700 text-white focus:border-indigo-500'
                        }`} 
                        placeholder={usesSystemKey ? "Using System .env credential..." : "Paste unique provider key here (Stored in DB)..."} 
                    />
                    <button 
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        disabled={usesSystemKey}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors ${usesSystemKey ? 'text-slate-800' : 'text-slate-600 hover:text-white'}`}
                    >
                        {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                <div className="flex items-start gap-2.5 px-1 opacity-60">
                    <Info size={12} className="text-slate-500 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-slate-500 font-medium leading-relaxed italic">
                        {usesSystemKey 
                            ? "This engine relies on server-level environment variables. Token field is locked for integrity."
                            : "Forged tokens are securely persisted to the application database. If the browser auto-fills your account password, clear it manually."}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-5 gap-6">
                <div className="col-span-1 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Method</label>
                    <select 
                        value={formData.requestMethod} 
                        onChange={e => setFormData({...formData, requestMethod: e.target.value})} 
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-indigo-400 font-bold outline-none"
                    >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                    </select>
                </div>
                <div className="col-span-1 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Upstream Model ID</label>
                    <input
                        type="text"
                        value={formData.upstreamId || ''}
                        onChange={e => setFormData({ ...formData, upstreamId: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-xs text-indigo-300 font-mono outline-none focus:border-indigo-500"
                        placeholder="e.g. flux, openai, veo"
                    />
                </div>
                <div className="col-span-3 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Gateway Endpoint URL</label>
                    <input 
                        type="text" 
                        value={formData.requestUrl} 
                        onChange={e => setFormData({...formData, requestUrl: e.target.value})} 
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-xs text-white font-mono outline-none focus:border-indigo-500" 
                        placeholder="https://api.provider.com/v1/generate?p={{prompt}}" 
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Request Headers (JSON)</label>
                <textarea 
                    value={formData.requestHeaders} 
                    onChange={e => setFormData({...formData, requestHeaders: e.target.value})} 
                    className="w-full h-24 bg-black border border-slate-800 rounded-2xl p-4 text-[11px] text-indigo-300 font-mono outline-none focus:border-indigo-500 resize-none" 
                    placeholder='{"Authorization": "Bearer {{api_key}}", "Content-Type": "application/json"}' 
                />
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Request Body Template (JSON)</label>
                <textarea 
                    value={formData.requestBodyTemplate} 
                    onChange={e => setFormData({...formData, requestBodyTemplate: e.target.value})} 
                    className="w-full h-32 bg-black border border-slate-800 rounded-2xl p-4 text-[11px] text-emerald-400 font-mono outline-none focus:border-indigo-500 resize-none" 
                    placeholder='{"model": "v1", "input": {"prompt": "{{prompt}}", "seed": {{seed}}}}' 
                />
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Inference Response Mapping (Dot Path)</label>
                <input 
                    type="text" 
                    value={formData.responsePath} 
                    onChange={e => setFormData({...formData, responsePath: e.target.value})} 
                    className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:border-indigo-500" 
                    placeholder="e.g. data.0.url or candidates.0.content.parts.0.text" 
                />
            </div>
        </div>
    );
};
