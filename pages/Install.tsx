import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Loader2, Settings2, ShieldCheck, Sparkles, Wrench, KeyRound, Link as LinkIcon, FolderTree, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../services/api';
import type { InstallStatus, InstallerRuntimeConfig, InstallSummary } from '../types';
import BrandMark from '../components/BrandMark';

interface InstallPageProps {
  initialStatus: InstallStatus;
  onStatusChange: (status: InstallStatus) => void | Promise<void>;
}

const formatTimestamp = (value: number | null) => {
  if (!value) return 'Not completed';
  return new Date(value).toLocaleString();
};

const hasRuntimeValue = (value: string | undefined) => !!String(value || '').trim();

const Install: React.FC<InstallPageProps> = ({ initialStatus, onStatusChange }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<InstallStatus>(initialStatus);
  const [instanceName, setInstanceName] = useState(initialStatus.installer.instanceName || 'AIMANA');
  const [installMode, setInstallMode] = useState('local-first');
  const [installNotes, setInstallNotes] = useState('');
  const [adminName, setAdminName] = useState('Root Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [runtimeConfig, setRuntimeConfig] = useState<InstallerRuntimeConfig | null>(null);
  const [installSummary, setInstallSummary] = useState<InstallSummary | null>(null);
  const [runtimeValues, setRuntimeValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);

  const buildRuntimeValues = (config: InstallerRuntimeConfig) => {
    const nextValues: Record<string, string> = {};
    for (const category of config.categories) {
      for (const field of category.fields) {
        nextValues[field.key] = field.currentValue || '';
      }
    }
    return nextValues;
  };

  useEffect(() => {
    setStatus(initialStatus);
    setInstanceName(initialStatus.installer.instanceName || 'AIMANA');
  }, [initialStatus]);

  useEffect(() => {
    const loadRuntimeConfig = async () => {
      try {
        const [configResult, summaryResult] = await Promise.allSettled([
          api.app.getRuntimeConfig(),
          api.app.getInstallSummary()
        ]);
        if (configResult.status !== 'fulfilled') {
          throw configResult.reason;
        }
        const nextConfig = configResult.value;
        setRuntimeConfig(nextConfig);
        if (summaryResult.status === 'fulfilled') {
          setInstallSummary(summaryResult.value);
        }
        setRuntimeValues(buildRuntimeValues(nextConfig));
      } catch (err) {
        console.error('Failed to load runtime installer config', err);
      }
    };

    void loadRuntimeConfig();
  }, []);

  const refreshStatus = async () => {
    const nextStatus = await api.app.getInstallStatus();
    setStatus(nextStatus);
    await onStatusChange(nextStatus);
    return nextStatus;
  };

  const refreshRuntimeConfig = async () => {
    const nextConfig = await api.app.getRuntimeConfig();
    setRuntimeConfig(nextConfig);
    return nextConfig;
  };

  const resetRuntimeValuesToCurrentDefaults = () => {
    if (!runtimeConfig) return;
    setRuntimeValues(buildRuntimeValues(runtimeConfig));
  };

  const refreshInstallSummary = async () => {
    const nextSummary = await api.app.getInstallSummary();
    setInstallSummary(nextSummary);
    return nextSummary;
  };

  const blockingIssues = useMemo(
    () => status.issues.filter((issue) => issue.severity === 'error'),
    [status.issues]
  );
  const warningIssues = useMemo(
    () => status.issues.filter((issue) => issue.severity === 'warn'),
    [status.issues]
  );

  const requiredRuntimeMissing = useMemo(() => {
    if (!runtimeConfig) return [];
    const missing = runtimeConfig.categories.flatMap((category) =>
      category.fields
        .filter((field) => field.required && !field.configured && !hasRuntimeValue(runtimeValues[field.key]))
        .map((field) => field.label)
    );
    if (status.issues.some((issue) => issue.code === 'auth-secret-unsafe') && !missing.includes('Auth Secret')) {
      missing.push('Auth Secret');
    }
    const provider = String(runtimeValues.CHAT_WEB_SEARCH_PROVIDER || 'none').trim().toLowerCase();
    if (provider === 'tavily' && !hasRuntimeValue(runtimeValues.TAVILY_API_KEY) && !runtimeConfig.categories.some((category) => category.fields.some((field) => field.key === 'TAVILY_API_KEY' && field.configured))) {
      missing.push('Tavily API Key');
    }
    if (provider === 'searxng' && !hasRuntimeValue(runtimeValues.CHAT_WEB_SEARCH_SEARXNG_URL) && !runtimeConfig.categories.some((category) => category.fields.some((field) => field.key === 'CHAT_WEB_SEARCH_SEARXNG_URL' && field.configured))) {
      missing.push('SearXNG URL');
    }
    return missing;
  }, [runtimeConfig, runtimeValues, status.issues]);

  const hasInstallerConfig = !!status.installer.configCompletedAt;
  const hasRequiredRuntimeConfig = requiredRuntimeMissing.length === 0;
  const canFinalize = status.admin.exists && hasInstallerConfig && hasRequiredRuntimeConfig && blockingIssues.length === 0;
  const isInstallComplete = status.state === 'ready' || status.state === 'degraded';
  const checklistItems = [
    {
      label: 'Environment has no blocking errors',
      complete: blockingIssues.length === 0,
      detail: blockingIssues.length === 0 ? 'Ready' : `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? '' : 's'}`
    },
    {
      label: 'Required runtime config saved',
      complete: hasRequiredRuntimeConfig,
      detail: hasRequiredRuntimeConfig ? 'Required values are present' : `Missing ${requiredRuntimeMissing.join(', ')}`
    },
    {
      label: 'Installer settings saved',
      complete: hasInstallerConfig,
      detail: hasInstallerConfig ? formatTimestamp(status.installer.configCompletedAt) : 'Save instance settings first'
    },
    {
      label: 'Root admin created',
      complete: status.admin.exists,
      detail: status.admin.user?.email || 'Create the first admin account'
    },
    {
      label: 'Finalize installation',
      complete: !!status.installer.finalizedAt,
      detail: status.installer.finalizedAt ? formatTimestamp(status.installer.finalizedAt) : 'Available after required checks pass'
    }
  ];
  const stateClassName = status.state === 'needs-config'
    ? 'text-red-300'
    : status.state === 'needs-admin-setup' || status.state === 'needs-finalize'
      ? 'text-amber-300'
      : status.state === 'degraded'
        ? 'text-amber-200'
        : 'text-emerald-300';

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSavingConfig(true);
    try {
      await api.app.saveInstallConfig({
        instanceName: instanceName.trim(),
        mode: installMode,
        notes: installNotes.trim()
      });
      await Promise.all([refreshStatus(), refreshInstallSummary()]);
      setSuccess('Installer configuration saved.');
    } catch (err: any) {
      setError(err.message || 'Failed to save installer configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (adminPassword.length < 10) {
      setError('Use a password with at least 10 characters for the initial admin.');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('The admin passwords do not match.');
      return;
    }

    setIsCreatingAdmin(true);
    try {
      await api.app.bootstrapAdmin({
        name: adminName.trim() || 'Root Admin',
        email: adminEmail.trim(),
        password: adminPassword
      });
      await Promise.all([refreshStatus(), refreshInstallSummary()]);
      setSuccess('Initial admin created. You can finalize installation now.');
      setAdminPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to create the initial admin.');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleSaveRuntimeConfig = async (generateAuthSecret = false) => {
    setError(null);
    setSuccess(null);
    setIsSavingRuntime(true);
    try {
      const payload: Record<string, string | boolean> = {
        generateAuthSecret
      };
      for (const [key, value] of Object.entries(runtimeValues)) {
        if (!value.trim()) continue;
        payload[key] = value.trim();
      }
      await api.app.saveRuntimeConfig(payload);
      await Promise.all([refreshRuntimeConfig(), refreshStatus(), refreshInstallSummary()]);
      setSuccess(generateAuthSecret ? 'Runtime config saved and a fresh AUTH_SECRET was generated.' : 'Runtime config saved.');
    } catch (err: any) {
      setError(err.message || 'Failed to save runtime configuration.');
    } finally {
      setIsSavingRuntime(false);
    }
  };

  const handleFinalize = async () => {
    setError(null);
    setSuccess(null);
    if (!canFinalize) {
      setError('Complete the required installer checklist before finalizing. Optional .env values can be updated later.');
      return;
    }
    setIsFinalizing(true);
    try {
      await api.app.finalizeInstall();
      await Promise.all([refreshStatus(), refreshInstallSummary()]);
      setSuccess('Installation finalized. Review the operator summary below, then continue to sign in.');
    } catch (err: any) {
      setError(err.message || 'Failed to finalize installation.');
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-8 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <BrandMark
                className="items-center"
                imageClassName="h-14 w-auto drop-shadow-[0_0_24px_rgba(99,102,241,0.18)]"
                wordmarkClassName="ml-4 text-2xl font-black tracking-tight text-white"
              />
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
                <Sparkles size={12} /> AIMANA Installer
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white">Finish Setting Up This Instance</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                  This guided installer prepares the instance, creates the first admin, and records installation progress before normal sign-in begins.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4 text-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Current State</div>
              <div className={`mt-2 text-lg font-black ${stateClassName}`}>
                {status.state}
              </div>
              <div className="mt-2 text-xs text-slate-500">Last preflight: {formatTimestamp(status.checkedAt)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <Wrench className="text-cyan-300" size={20} />
                <h2 className="text-lg font-bold text-white">Environment Review</h2>
              </div>
              <div className="mt-5 space-y-3">
                {blockingIssues.length === 0 && warningIssues.length === 0 && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    No install issues were detected in the current environment.
                  </div>
                )}
                {blockingIssues.map((issue) => (
                  <div key={issue.code} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 text-red-300" size={16} />
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-red-200">Blocking</div>
                        <p className="mt-1 text-sm text-red-100">{issue.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {warningIssues.map((issue) => (
                  <div key={issue.code} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 text-amber-300" size={16} />
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Warning</div>
                        <p className="mt-1 text-sm text-amber-50">{issue.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <Settings2 className="text-violet-300" size={20} />
                <h2 className="text-lg font-bold text-white">Instance Settings</h2>
              </div>
              <form onSubmit={handleSaveConfig} className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Instance Name</label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-violet-400"
                    placeholder="AIMANA Studio"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Install Mode</label>
                  <select
                    value={installMode}
                    onChange={(e) => setInstallMode(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-violet-400"
                  >
                    <option value="local-first">Local First</option>
                    <option value="creative-lab">Creative Lab</option>
                    <option value="team-pilot">Team Pilot</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Notes</label>
                  <textarea
                    value={installNotes}
                    onChange={(e) => setInstallNotes(e.target.value)}
                    className="min-h-[110px] w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-violet-400"
                    placeholder="Optional deployment notes for this instance."
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingConfig ? <><Loader2 size={14} className="animate-spin" /> Saving</> : 'Save Installer Config'}
                </button>
              </form>
            </div>

            {!status.admin.exists && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-emerald-300" size={20} />
                  <h2 className="text-lg font-bold text-white">Initial Admin</h2>
                </div>
                <form onSubmit={handleCreateAdmin} className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="install-admin-name" className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Admin Name</label>
                    <input
                      id="install-admin-name"
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400"
                      placeholder="Root Admin"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="install-admin-email" className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Admin Email</label>
                    <input
                      id="install-admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400"
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="install-admin-password" className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Create Password</label>
                    <input
                      id="install-admin-password"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400"
                      placeholder="Create a strong password"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="install-admin-confirm-password" className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Confirm Password</label>
                    <input
                      id="install-admin-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400"
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={isCreatingAdmin}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingAdmin ? <><Loader2 size={14} className="animate-spin" /> Creating</> : 'Create Initial Admin'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {runtimeConfig && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
                <div className="flex items-center gap-3">
                  <KeyRound className="text-indigo-300" size={20} />
                  <h2 className="text-lg font-bold text-white">Runtime Secrets & Integrations</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Configure only the values you need right now. Required values protect the instance; optional values unlock AI, identity, and fallback search features.
                </p>

                <div className="mt-5 space-y-5">
                  {runtimeConfig.categories.map((category) => (
                    <div key={category.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div>
                        <h3 className="text-sm font-black text-white">{category.label}</h3>
                        <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                      </div>
                      <div className="mt-4 space-y-4">
                        {category.fields.map((field) => (
                          <div key={field.key} className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{field.label}</label>
                              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${field.required ? 'bg-red-500/15 text-red-200' : 'bg-slate-800 text-slate-400'}`}>
                                {field.required ? 'Required' : 'Optional'}
                              </span>
                            </div>
                            {field.kind === 'select' ? (
                              <select
                                value={runtimeValues[field.key] ?? field.currentValue ?? 'none'}
                                onChange={(e) => setRuntimeValues((current) => ({ ...current, [field.key]: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-indigo-400"
                              >
                                {(field.options || []).map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={field.kind === 'secret' ? 'password' : 'text'}
                                value={runtimeValues[field.key] ?? ''}
                                onChange={(e) => setRuntimeValues((current) => ({ ...current, [field.key]: e.target.value }))}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-indigo-400"
                                placeholder={field.maskedValue || field.description}
                              />
                            )}
                            <p className="text-xs text-slate-500">{field.description}</p>
                            <p className="text-xs text-slate-400">{field.impact}</p>
                            {field.maskedValue && (
                              <p className="text-[11px] font-mono text-slate-500">Current: {field.maskedValue}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => { void handleSaveRuntimeConfig(false); }}
                    disabled={isSavingRuntime}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingRuntime ? <><Loader2 size={14} className="animate-spin" /> Saving</> : 'Save Runtime Config'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSaveRuntimeConfig(true); }}
                    disabled={isSavingRuntime}
                    className="inline-flex items-center gap-2 rounded-2xl border border-indigo-400/40 bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-indigo-200 transition-colors hover:border-indigo-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generate New AUTH_SECRET
                  </button>
                  <button
                    type="button"
                    onClick={resetRuntimeValuesToCurrentDefaults}
                    disabled={isSavingRuntime}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Restore Current Defaults
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Feature Impact Summary</div>
                  <div className="mt-3 space-y-2">
                    {runtimeConfig.impacts.map((impact) => (
                      <div key={impact.key} className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                        {impact.message}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white">Required Checklist</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Only required setup items block finalization. Optional AI, identity, and provider values can be added later in the environment file.
              </p>
              <div className="mt-5 space-y-3">
                {checklistItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    {item.complete ? (
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={17} />
                    ) : (
                      <Circle className="mt-0.5 shrink-0 text-slate-600" size={17} />
                    )}
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${item.complete ? 'text-slate-100' : 'text-slate-400'}`}>{item.label}</div>
                      <div className="mt-1 break-words text-xs text-slate-500">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {!hasRequiredRuntimeConfig && (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                  Save required runtime values or generate a new AUTH_SECRET before finalizing.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white">Install Progress</h2>
              <div className="mt-5 space-y-3">
                {[
                  { label: 'Installer started', value: formatTimestamp(status.installer.installStartedAt) },
                  { label: 'Config saved', value: formatTimestamp(status.installer.configCompletedAt) },
                  { label: 'Admin created', value: formatTimestamp(status.installer.bootstrapCompletedAt) },
                  { label: 'Finalized', value: formatTimestamp(status.installer.finalizedAt) }
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    <div className="text-sm text-slate-300">{item.label}</div>
                    <div className="text-xs font-semibold text-slate-500">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white">Finalize</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Finalize the installer after the environment is clean and the first admin is in place. You can still sign in later and continue configuration from Settings.
              </p>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={!canFinalize || isFinalizing}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFinalizing ? <><Loader2 size={14} className="animate-spin" /> Finalizing</> : <>Finalize Installation <ArrowRight size={14} /></>}
              </button>
              {!canFinalize && (
                <p className="mt-3 text-xs text-slate-500">
                  Complete required checklist items before finalizing. Optional .env values can be configured later.
                </p>
              )}
            </div>

            {installSummary && isInstallComplete && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-300" size={20} />
                  <h2 className="text-lg font-bold text-white">Post-Install Summary</h2>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      <LinkIcon size={12} />
                      App URL
                    </div>
                    <p className="mt-2 break-all text-sm text-cyan-200">{installSummary.appUrl}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Admin Account</div>
                    <p className="mt-2 text-sm text-slate-200">
                      {installSummary.adminAccount
                        ? `${installSummary.adminAccount.name} (${installSummary.adminAccount.email})`
                        : 'No admin account detected.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      <FolderTree size={12} />
                      Storage Path
                    </div>
                    <p className="mt-2 break-all text-sm text-slate-200">{installSummary.storage.root}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Enabled Integrations</div>
                  <div className="mt-3 space-y-2">
                    {installSummary.enabledIntegrations.map((integration) => (
                      <div key={integration.key} className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-100">{integration.label}</span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${integration.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-800 text-slate-400'}`}>
                            {integration.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{integration.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <LockKeyhole size={12} />
                    Next Hardening Steps
                  </div>
                  <div className="mt-3 space-y-2">
                    {installSummary.recommendedHardeningSteps.map((step) => (
                      <div key={step} className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(error || success) && (
              <div className={`rounded-3xl border p-4 shadow-xl ${error ? 'border-red-500/30 bg-red-500/10 text-red-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
                <div className="flex items-start gap-3">
                  {error ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
                  <p className="text-sm leading-relaxed">{error || success}</p>
                </div>
              </div>
            )}

            {isInstallComplete && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
                >
                  Continue To Login
                </button>
                {api.auth.isAuthenticated() && (
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:border-cyan-400 hover:text-white"
                  >
                    Open AIMANA
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Install;
