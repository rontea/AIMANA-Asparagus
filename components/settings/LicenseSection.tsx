import React from 'react';
import { Heart, Github, ExternalLink, Package, ShieldCheck, Zap, BrainCircuit, Database, Globe, Code2 } from 'lucide-react';

interface Dependency {
    name: string;
    description: string;
    category: 'Core' | 'Visual' | 'Neural' | 'Logic' | 'Utility' | 'Provider';
    icon: any;
    // Fix: Make link optional as some dependencies might not have a public documentation link or it might be omitted.
    link?: string;
}

const DEPENDENCIES: Dependency[] = [
    { name: 'Google Gemini API', description: 'Primary multimodal provider for text, image, and speech workflows.', category: 'Provider', icon: Globe, link: 'https://ai.google.dev/' },
    { name: 'Gemini Free Tier', description: 'Free-tier Gemini model access used for cost-efficient development and baseline workflows.', category: 'Provider', icon: Globe, link: 'https://ai.google.dev/gemini-api/docs/pricing' },
    { name: 'OpenAI GPT-Codex', description: 'Coding model ecosystem acknowledged for development assistance and code-oriented workflows.', category: 'Provider', icon: Globe, link: 'https://openai.com/codex/' },
    { name: 'Pollinations.AI', description: 'Gateway provider for chat, image, video, and open-model routing used by AIMANA.', category: 'Provider', icon: Globe, link: 'https://pollinations.ai/' },
    { name: '@google/genai', description: 'Official SDK bridge used to orchestrate Gemini model requests.', category: 'Neural', icon: BrainCircuit, link: 'https://www.npmjs.com/package/@google/genai' },
    { name: 'React', description: 'Declarative component architecture for high-fidelity interfaces.', category: 'Core', icon: Zap, link: 'https://react.dev' },
    { name: 'React Router', description: 'Client-side routing and protected navigation orchestration.', category: 'Core', icon: Zap, link: 'https://reactrouter.com/' },
    { name: 'Tailwind CSS', description: 'Precision atomic styling and design system enforcement.', category: 'Visual', icon: Zap, link: 'https://tailwindcss.com' },
    { name: 'Lucide Icons', description: 'Beautifully crafted neural-inspired iconography.', category: 'Visual', icon: Github, link: 'https://lucide.dev' },
    { name: 'SQLite3', description: 'High-performance transactional metadata persistence.', category: 'Logic', icon: Database },
    { name: 'Express.js', description: 'Robust middleware-centric backend orchestration.', category: 'Logic', icon: Package, link: 'https://expressjs.com' },
    { name: 'Compression', description: 'HTTP response compression middleware for faster server delivery.', category: 'Utility', icon: Zap, link: 'https://github.com/expressjs/compression' },
    { name: 'CORS', description: 'Cross-origin request middleware for controlled API access.', category: 'Utility', icon: ShieldCheck, link: 'https://github.com/expressjs/cors' },
    { name: 'Dotenv', description: 'Environment configuration loading for local and deployed runtime settings.', category: 'Utility', icon: Package, link: 'https://github.com/motdotla/dotenv' },
    { name: 'Multer', description: 'Multipart upload handling for imported and generated media assets.', category: 'Utility', icon: Package, link: 'https://github.com/expressjs/multer' },
    { name: 'react-markdown', description: 'Structured markdown rendering for rich chat and content surfaces.', category: 'Utility', icon: Package, link: 'https://github.com/remarkjs/react-markdown' },
    { name: 'remark-gfm', description: 'GitHub-flavored markdown support for tables, task lists, and richer chat formatting.', category: 'Utility', icon: Package, link: 'https://github.com/remarkjs/remark-gfm' },
    { name: 'rehype-sanitize', description: 'HTML sanitization layer for safer rendered markdown output.', category: 'Utility', icon: ShieldCheck, link: 'https://github.com/rehypejs/rehype-sanitize' },
    { name: 'rehype-highlight', description: 'Syntax highlighting integration for rendered code blocks.', category: 'Visual', icon: Code2, link: 'https://github.com/rehypejs/rehype-highlight' },
    { name: 'highlight.js', description: 'Code syntax highlighting engine used in markdown and chat surfaces.', category: 'Visual', icon: Code2, link: 'https://highlightjs.org/' },
    { name: 'Archiver', description: 'Server-side Zip64 streaming used for large System Operations backup bundles.', category: 'Utility', icon: Package, link: 'https://www.archiverjs.com/' },
    { name: 'JSZip', description: 'Client-side ZIP import/export workflows and backup bundle parsing support.', category: 'Utility', icon: Package, link: 'https://stuk.github.io/jszip/' },
    { name: 'QRCode', description: 'QR generation layer used for 2FA authenticator enrollment.', category: 'Utility', icon: ShieldCheck, link: 'https://github.com/soldair/node-qrcode' },
    { name: 'OTPAuth', description: 'RFC 6238 compliant TOTP identity verification.', category: 'Utility', icon: ShieldCheck, link: 'https://github.com/hectorm/otpauth' },
    { name: 'UUID', description: 'Unique identifier generation for records, sessions, and asset workflows.', category: 'Utility', icon: Package, link: 'https://github.com/uuidjs/uuid' },
    { name: 'clsx', description: 'Conditional class composition for dynamic React interface states.', category: 'Utility', icon: Package, link: 'https://github.com/lukeed/clsx' },
    { name: 'tailwind-merge', description: 'Tailwind class conflict resolution for composed component styling.', category: 'Visual', icon: Zap, link: 'https://github.com/dcastil/tailwind-merge' },
    { name: 'Vite', description: 'Next-generation neural-speed build tooling.', category: 'Core', icon: Zap, link: 'https://vitejs.dev' }
];

export const LicenseSection: React.FC = () => {
    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Heart size={20} className="text-rose-500 fill-rose-500/20" /> Acknowledgements & OSS
                </h2>
                <span className="text-[10px] font-black bg-slate-900/50 text-slate-500 border border-slate-700 px-3 py-1 rounded-full uppercase tracking-widest">OSS + API Ecosystem</span>
            </div>
            
            <div className="p-8">
                <p className="text-sm text-slate-400 leading-relaxed mb-8">
                    AIMANA is forged upon the collective intelligence of both the Open Source community and external AI/API partners. We extend our gratitude to the maintainers and teams behind the technologies that power our neural infrastructure.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {DEPENDENCIES.map((dep) => (
                        <div key={dep.name} className="group p-4 bg-slate-900/40 border border-slate-800 rounded-2xl hover:border-indigo-500/30 transition-all">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform">
                                    <dep.icon size={16} />
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                                    dep.category === 'Provider' ? 'bg-cyan-900/20 border-cyan-500/30 text-cyan-400' :
                                    dep.category === 'Neural' ? 'bg-indigo-900/20 border-indigo-500/30 text-indigo-400' :
                                    dep.category === 'Core' ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' :
                                    'bg-slate-800 border-slate-700 text-slate-500'
                                }`}>
                                    {dep.category}
                                </span>
                            </div>
                            <h3 className="text-xs font-black text-white uppercase tracking-tight mb-1">{dep.name}</h3>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-medium mb-3">
                                {dep.description}
                            </p>
                            {dep.link && (
                                <a 
                                    href={dep.link} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[9px] font-black text-indigo-400 hover:text-white uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    Source Registry <ExternalLink size={8} />
                                </a>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shadow-xl">
                            <Github size={20} className="text-slate-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest">Built for the Ecosystem</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Hybrid Asset Management v1.2</p>
                        </div>
                    </div>
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em] text-center md:text-right">
                        Licenses follow standard MIT/Apache 2.0 <br/> protocols of respective owners.
                    </div>
                </div>
            </div>
        </section>
    );
};
