import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layers, Settings, LogOut, Archive, Shield, ChevronDown, Key, Lock, Clock, Pin, Database, ListChecks, Cpu, Sparkles, ChevronRight, BrainCircuit, Zap, Square, Square as SquareIcon, Puzzle, GripVertical, Trash2, Box, Bell, Search, X, Flower2, Gauge, Tag, Bot } from 'lucide-react';
/* Splitting react-router-dom and react-router to fix missing named export errors */
import { Link } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../services/api';
import { privilegedAuth } from '../services/privilegedAuth';
import { useGlobalErrorReporting } from '../hooks/useGlobalErrorReporting';
import { User, Project } from '../types';
import ChangePasswordModal from './ChangePasswordModal';
import BrandMark from './BrandMark';
import AppLauncher from './launcher/AppLauncher';
import { POLLEN_CREDIT_CONTEXT_EVENT, PollenCreditContext } from '../utils/pollenCreditChannel';
import {
  DEFAULT_POLLEN_CREDIT_BALANCE,
  getPollenCreditBalanceState,
  POLLEN_CREDIT_BALANCE_EVENT,
  POLLEN_CREDIT_REFRESH_INTERVAL_MS,
  PollenCreditBalanceState,
  refreshPollenCreditBalance,
  refreshPollenCreditBalanceFromAccount,
  setManualPollenCreditFallbackRate,
  syncPollenCreditBalance
} from '../utils/pollenCreditBalance';
import { formatPollenAmount } from '../utils/pollenCredits';
import { getAccessibleSidebarExtensionLinks } from '../extensions/registry';

interface LayoutProps { children: React.ReactNode; }

type NotificationTone = 'info' | 'error' | 'success';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  tone: NotificationTone;
  source?: string;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  useGlobalErrorReporting();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [pinnedProjects, setPinnedProjects] = useState<Project[]>([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<NotificationItem | null>(null);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [isCreditOpen, setIsCreditOpen] = useState(false);
  const [isGoogleCreditOpen, setIsGoogleCreditOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [pollenCredit, setPollenCredit] = useState<PollenCreditContext>({ visible: false });
  const [pollenBalance, setPollenBalance] = useState<PollenCreditBalanceState>(() => getPollenCreditBalanceState({ notify: false }));
  
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(true);
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(true);
  const [isSuperOpsOpen, setIsSuperOpsOpen] = useState(true);
  const [neuralArchiveProjectId, setNeuralArchiveProjectId] = useState<string | null>(null);
  const [assetIngestionProjectId, setAssetIngestionProjectId] = useState<string | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const googleCreditRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<any>(null);

  // Drag and Drop state
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    privilegedAuth.revoke();
    await api.auth.logout();
    navigate('/login');
  }, [navigate]);

  const loadPinnedProjects = async () => {
      try {
          const all = await api.projects.list();
          // Sort by pinnedOrder ascending
          setPinnedProjects(
              all.filter(p => p.isPinned && !p.isArchived)
                .sort((a, b) => (a.pinnedOrder || 0) - (b.pinnedOrder || 0))
          );
      } catch (e) {}
  };

  const loadSystemSettings = useCallback(async () => {
      try {
          const s = await api.settings.get();
          setTimeoutMinutes(s.inactivityTimeout || 0);
          setManualPollenCreditFallbackRate(s.manualPollenHourlyRate ?? DEFAULT_POLLEN_CREDIT_BALANCE);
          setPollenBalance((current) => (
              current.source === 'pollinations-account'
                  ? current
                  : refreshPollenCreditBalance('manual')
          ));
      } catch (e) {}
  }, []);

  useEffect(() => {
    const u = api.auth.getUser();
    if (u) {
      setUser(u);
      loadPinnedProjects();
      loadSystemSettings();
    }
  }, [loadSystemSettings]);

  useEffect(() => {
    if (!user?.id) return;
    let isCancelled = false;
    const loadSystemProjects = async () => {
      try {
        const [archive, assetIngestion] = await Promise.all([
          fetch('/api/projects/archive', {
            headers: api.auth.getAuthHeaders()
          }).then(r => r.ok ? r.json() : null),
          fetch('/api/projects/asset-ingestion', {
            headers: api.auth.getAuthHeaders()
          }).then(r => r.ok ? r.json() : null)
        ]);
        if (!isCancelled) {
          setNeuralArchiveProjectId(archive?.id || null);
          setAssetIngestionProjectId(assetIngestion?.id || null);
        }
      } catch {
        if (!isCancelled) {
          setNeuralArchiveProjectId(null);
          setAssetIngestionProjectId(null);
        }
      }
    };
    loadSystemProjects();
    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const handlePinnedRefresh = () => loadPinnedProjects();
    const handleSettingsRefresh = () => loadSystemSettings();
    window.addEventListener('project-pinned-updated', handlePinnedRefresh);
    window.addEventListener('settings-updated', handleSettingsRefresh);
    
    return () => {
        window.removeEventListener('project-pinned-updated', handlePinnedRefresh);
        window.removeEventListener('settings-updated', handleSettingsRefresh);
    };
  }, [loadSystemSettings]);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    const onUserInteraction = () => {
      privilegedAuth.extend();
      if (timeoutMinutes > 0) {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          if (api.auth.isAuthenticated()) handleLogout();
        }, timeoutMinutes * 60 * 1000);
      }
    };
    events.forEach(evt => document.addEventListener(evt, onUserInteraction));
    onUserInteraction();
    return () => {
      events.forEach(evt => document.removeEventListener(evt, onUserInteraction));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [timeoutMinutes, user, handleLogout]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (creditRef.current && !creditRef.current.contains(event.target as Node)) setIsCreditOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (googleCreditRef.current && !googleCreditRef.current.contains(event.target as Node)) setIsGoogleCreditOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      const handleNotification = (event: Event) => {
          const detail = (event as CustomEvent)?.detail || {};
          const title = String(detail.title || 'Notification');
          const message = String(detail.message || '');
          const tone: NotificationTone = detail.type === 'error' || detail.tone === 'error' ? 'error' : 'info';
          const resolvedTone: NotificationTone = detail.type === 'success' || detail.tone === 'success' ? 'success' : tone;
          const item: NotificationItem = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title,
              message,
              timestamp: Date.now(),
              read: false,
              tone: resolvedTone,
              source: detail.source ? String(detail.source) : undefined
          };
          setNotifications(prev => [item, ...prev].slice(0, 50));
          if (resolvedTone === 'error') setActiveNotification(item);
          if (resolvedTone === 'success') {
              setToasts(prev => [...prev, item].slice(-4));
              window.setTimeout(() => {
                  setToasts(prev => prev.filter(t => t.id !== item.id));
              }, 4200);
          }
      };
      window.addEventListener('aimana-notification', handleNotification as EventListener);
      return () => window.removeEventListener('aimana-notification', handleNotification as EventListener);
  }, []);

  useEffect(() => {
      const handlePollenCreditContext = (event: Event) => {
          const detail = (event as CustomEvent<PollenCreditContext>)?.detail;
          if (!detail || detail.visible === false) {
              setPollenCredit({ visible: false });
              setIsCreditOpen(false);
              setIsGoogleCreditOpen(false);
              return;
          }

          setPollenCredit({
              visible: true,
              mode: detail.mode || 'image',
              provider: detail.provider || null,
              activeModelLabel: detail.activeModelLabel || null,
              googleQuotaLabel: detail.googleQuotaLabel || null,
              creditRate: detail.creditRate || null,
              creditRateDetail: detail.creditRateDetail || null,
              lastPollenUsed: detail.lastPollenUsed || null,
              googleRate: detail.googleRate || null,
              googleRateDetail: detail.googleRateDetail || null,
              lastGoogleUsage: detail.lastGoogleUsage || null,
              lastGoogleCost: detail.lastGoogleCost || null,
              isGenerating: !!detail.isGenerating
          });
      };

      window.addEventListener(POLLEN_CREDIT_CONTEXT_EVENT, handlePollenCreditContext as EventListener);
      return () => window.removeEventListener(POLLEN_CREDIT_CONTEXT_EVENT, handlePollenCreditContext as EventListener);
  }, []);

  useEffect(() => {
      const handlePollenBalance = (event: Event) => {
          const detail = (event as CustomEvent<PollenCreditBalanceState>)?.detail;
          if (!detail) return;
          setPollenBalance(detail);
      };

      let refreshTimerId: number | null = null;

      const syncPollenBalance = async () => {
          const current = getPollenCreditBalanceState({ notify: false });
          if (Date.now() < current.nextRefreshAt) {
              setPollenBalance(current);
              return current;
          }
          const next = syncPollenCreditBalance();
          setPollenBalance(next);
          return next;
      };

      const scheduleNextPollenRefresh = (state: PollenCreditBalanceState) => {
          if (refreshTimerId !== null) {
              window.clearTimeout(refreshTimerId);
          }
          const delay = Math.max(0, (state.nextRefreshAt || Date.now()) - Date.now());
          refreshTimerId = window.setTimeout(() => {
              void syncPollenBalance().then(scheduleNextPollenRefresh);
          }, delay);
      };

      setPollenBalance(getPollenCreditBalanceState());
      window.addEventListener(POLLEN_CREDIT_BALANCE_EVENT, handlePollenBalance as EventListener);
      void (async () => {
          const next = syncPollenCreditBalance();
          setPollenBalance(next);
          scheduleNextPollenRefresh(next);
      })();

      return () => {
          window.removeEventListener(POLLEN_CREDIT_BALANCE_EVENT, handlePollenBalance as EventListener);
          if (refreshTimerId !== null) {
              window.clearTimeout(refreshTimerId);
          }
      };
  }, []);

  useEffect(() => {
      if (!isNotifOpen) return;
      setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
  }, [isNotifOpen]);

  useEffect(() => {
      if (location.pathname !== '/search') return;
      setGlobalSearchTerm(new URLSearchParams(location.search).get('q') || '');
  }, [location.pathname, location.search]);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggedProjectId(projectId);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to hide the original element in the DOM while dragging
    setTimeout(() => {
      const el = e.target as HTMLElement;
      el.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.target as HTMLElement;
    el.style.opacity = '1';
    setDraggedProjectId(null);
    setDropTargetId(null);
  };

  const handleDragOver = (e: React.DragEvent, projectId: string) => {
    e.preventDefault();
    if (draggedProjectId !== projectId) {
        setDropTargetId(projectId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedProjectId || draggedProjectId === targetId) return;

    const newPinned = [...pinnedProjects];
    const draggedIdx = newPinned.findIndex(p => p.id === draggedProjectId);
    const targetIdx = newPinned.findIndex(p => p.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    // Local reorder
    const [movedProject] = newPinned.splice(draggedIdx, 1);
    newPinned.splice(targetIdx, 0, movedProject);

    // Optimized local state update
    setPinnedProjects(newPinned);
    setDropTargetId(null);

    // Persist reorder to DB
    try {
        // We update all indices to be robust
        await Promise.all(newPinned.map((p, index) => 
            api.projects.update(p.id, { pinnedOrder: index })
        ));
    } catch (err) {
        console.error("Failed to sync project order", err);
        loadPinnedProjects(); // Revert on failure
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const canClearAll = notifications.length > 0 && unreadCount === 0;

  const handleToggleNotifications = () => setIsNotifOpen(prev => !prev);
  const handleClearNotifications = () => setNotifications([]);
  const markNotificationRead = (id: string) => {
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const isActive = (path: string) => location.pathname === path;
  const buildGlobalSearchPath = (tab: 'search' | 'ai-chat' = 'search') => {
      const query = globalSearchTerm.trim();
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (tab === 'ai-chat') params.set('tab', 'ai-chat');
      const search = params.toString();
      return search ? `/search?${search}` : (tab === 'ai-chat' ? '/search?tab=ai-chat' : '/search');
  };
  const handleGlobalSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      navigate(buildGlobalSearchPath('search'));
  };
  const handleGlobalAiChat = () => {
      navigate(buildGlobalSearchPath('ai-chat'));
  };
  const handleClearGlobalSearch = () => {
      setGlobalSearchTerm('');
      if (location.pathname === '/search') {
          navigate('/search', { replace: true });
      }
  };
  const neuralSavedHref = neuralArchiveProjectId ? `/project/${neuralArchiveProjectId}` : '/neural-saved';
  const isNeuralSavedActive = (
      (neuralArchiveProjectId && isActive(`/project/${neuralArchiveProjectId}`))
      || isActive('/neural-saved')
  );
  const assetIngestionHref = assetIngestionProjectId ? `/project/${assetIngestionProjectId}` : '/asset-ingestion';
  const isAssetIngestionActive = (
      (assetIngestionProjectId && isActive(`/project/${assetIngestionProjectId}`))
      || isActive('/asset-ingestion')
  );
  const isSuperUser = user?.id === 'admin-root';
  const canAccessCheckpointHub = user?.role === 'admin' || isSuperUser;
  const hasLivePollenCredit = pollenCredit.visible;
  const hasLiveGoogleCredit = Boolean(
      pollenCredit.visible && (
          pollenCredit.provider === 'google' ||
          pollenCredit.googleRate ||
          pollenCredit.lastGoogleUsage ||
          pollenCredit.lastGoogleCost ||
          pollenCredit.googleQuotaLabel
      )
  );
  const pollenBalanceLabel = `${formatPollenAmount(pollenBalance.balance || 0)} pollen`;
  const pollenCapLabel = `${formatPollenAmount(pollenBalance.cap || DEFAULT_POLLEN_CREDIT_BALANCE)} pollen`;
  const refreshAtLabel = new Date(pollenBalance.nextRefreshAt || (Date.now() + POLLEN_CREDIT_REFRESH_INTERVAL_MS)).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
  });
  const refreshedAtLabel = new Date(pollenBalance.refreshedAt || Date.now()).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
  });
  const pollenModeMeta = pollenCredit.mode === 'video'
      ? { label: 'AI Creative Video', accent: 'text-blue-300', badge: 'bg-blue-500/15 text-blue-200 border-blue-400/30' }
      : pollenCredit.mode === 'audio'
          ? { label: 'AI Creative Audio', accent: 'text-emerald-300', badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' }
          : pollenCredit.mode === 'music'
              ? { label: 'AI Creative Music', accent: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-200 border-amber-400/30' }
          : pollenCredit.mode === 'transcribe'
              ? { label: 'Audio to Text', accent: 'text-cyan-300', badge: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30' }
          : pollenCredit.mode === 'text'
          ? { label: 'AiMa Chat', accent: 'text-violet-300', badge: 'bg-violet-500/15 text-violet-200 border-violet-400/30' }
              : { label: 'AI Creative Image', accent: 'text-cyan-300', badge: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30' };
  const googleUsagePreviewLabel = pollenCredit.lastGoogleUsage
      || pollenCredit.lastGoogleCost
      || pollenCredit.googleQuotaLabel
      || (pollenCredit.isGenerating ? 'Tracking live usage' : 'No live usage');
  const isLivePollenAccountBalance = pollenBalance.source === 'pollinations-account';
  const isManualPollenBalance = !isLivePollenAccountBalance;
  const pollenBalanceTone = isLivePollenAccountBalance
      ? {
          button: hasLivePollenCredit
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15'
              : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800',
          icon: hasLivePollenCredit ? 'text-emerald-300' : 'text-slate-500',
          dot: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]',
          label: 'text-emerald-300',
          card: 'rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3',
          cardLabel: 'text-emerald-300/80',
          pill: 'border-emerald-400/20 bg-black/20 text-emerald-200',
          refresh: 'rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-colors hover:bg-emerald-500/20'
      }
      : {
          button: 'border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/15',
          icon: 'text-red-300',
          dot: 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.8)]',
          label: 'text-red-300',
          card: 'rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3',
          cardLabel: 'text-red-300/80',
          pill: 'border-red-400/20 bg-black/20 text-red-200',
          refresh: 'rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-red-200 transition-colors hover:bg-red-500/20'
      };
  const pollenBalanceModeLabel = isLivePollenAccountBalance ? 'Live Balance' : 'Manual Fallback';
  const pollenBalanceDescription = isLivePollenAccountBalance
      ? 'Last live account balance fetched from Pollinations API. Use refresh to check it again.'
      : 'Manual fallback from system settings. Use refresh only when you want to check the live Pollinations account balance.';
  const accessibleSidebarExtensionLinks = useMemo(() => getAccessibleSidebarExtensionLinks(user), [user]);
  const handleRefreshPollenBalance = async () => {
      const live = await refreshPollenCreditBalanceFromAccount();
      if (live) {
          setPollenBalance(live);
          return;
      }
      setPollenBalance(refreshPollenCreditBalance('manual'));
  };

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 overflow-hidden">
      <aside className="w-20 lg:w-64 border-r border-slate-800 flex flex-col justify-between hidden sm:flex bg-slate-900 z-[120] overflow-y-auto relative transition-all duration-500">
        <div className="flex flex-col flex-1 min-h(0)">
          <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-800 shrink-0">
            <BrandMark
              className="justify-center lg:justify-start"
              imageClassName="h-9 w-auto drop-shadow-[0_0_20px_rgba(99,102,241,0.2)]"
              wordmarkClassName="ml-3 font-bold text-xl hidden lg:block tracking-tight text-white"
            />
          </div>

          <nav className="mt-8 px-2 lg:px-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
            <Link to="/" className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/') || isActive('/dashboard') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
              <div className="w-6 h-6 flex justify-center items-center"><Gauge size={20} /></div>
              <span className="ml-3 font-medium hidden lg:block">Dashboard</span>
            </Link>

            <Link to="/projects" className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/projects') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
              <div className="w-6 h-6 flex justify-center items-center"><Layers size={20} /></div>
              <span className="ml-3 font-medium hidden lg:block">Project Dashboard</span>
            </Link>

            <Link to="/generate" className={`flex items-center p-3 rounded-lg transition-colors group ${isActive('/generate') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
              <div className="w-6 h-6 flex justify-center items-center">
                <span className="relative">
                  <Sparkles size={20} className={isActive('/generate') ? 'text-white' : 'text-indigo-400 group-hover:text-white transition-colors'} />
                  {!isActive('/generate') && <div className="absolute inset-0 bg-indigo-400/20 blur-md rounded-full group-hover:bg-indigo-400/40 transition-all"></div>}
                </span>
              </div>
              <span className="ml-3 font-medium hidden lg:block">Generate Content</span>
            </Link>

            {pinnedProjects.length > 0 && (
                <div className="pt-4 pb-2">
                    <div className="hidden lg:flex items-center gap-2 px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><Pin size={10} className="fill-current" /> Pinned</div>
                    <div className="space-y-1">
                        {pinnedProjects.map(p => (
                            <div
                                key={p.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, p.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, p.id)}
                                onDrop={(e) => handleDrop(e, p.id)}
                                className={`relative group transition-all duration-300 ${dropTargetId === p.id ? 'translate-y-1' : ''}`}
                            >
                                <Link 
                                    to={`/project/${p.id}`} 
                                    className={`flex items-center p-3 rounded-lg transition-colors group ${isActive(`/project/${p.id}`) ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'} ${draggedProjectId === p.id ? 'border-dashed border-indigo-500/50 border' : ''}`}
                                >
                                    <div className="w-6 h-6 flex justify-center items-center shrink-0">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || '#6366f1' }} />
                                    </div>
                                    <span className="ml-3 text-sm font-medium hidden lg:block truncate flex-1">{p.name}</span>
                                    <div className="hidden lg:block opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
                                        <GripVertical size={14} />
                                    </div>
                                </Link>
                                {dropTargetId === p.id && (
                                    <div className="absolute -bottom-1 left-3 right-3 h-0.5 bg-indigo-500 rounded-full animate-pulse" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </nav>
        </div>

        <div className="px-2 lg:px-4 mb-6 space-y-2 shrink-0">
            <Link to={assetIngestionHref} className={`flex items-center p-3 rounded-lg transition-colors ${isAssetIngestionActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
              <div className="w-6 h-6 flex justify-center items-center shrink-0"><Box size={18} /></div>
              <span className="ml-3 text-sm font-medium hidden lg:block">Asset Ingestion</span>
            </Link>

            <Link to={neuralSavedHref} className={`flex items-center p-3 rounded-lg transition-colors ${isNeuralSavedActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
              <div className="w-6 h-6 flex justify-center items-center shrink-0"><Archive size={18} /></div>
              <span className="ml-3 text-sm font-medium hidden lg:block">Neural Saved</span>
            </Link>

            {/* Extensions Group */}
            <div className="border-t border-slate-800 pt-4">
                <button onClick={() => setIsExtensionsOpen(!isExtensionsOpen)} className="w-full flex items-center justify-between px-3 mb-2 group">
                    <div className="flex items-center gap-2">
                      <div className="lg:hidden w-6 flex justify-center"><Puzzle size={14} className="text-slate-600" /></div>
                      <span className="hidden lg:block text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">Extensions</span>
                    </div>
                    <ChevronDown size={12} className={`text-slate-700 transition-transform duration-300 hidden lg:block ${isExtensionsOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>
                <div className={`space-y-1 overflow-hidden transition-all duration-300 ${isExtensionsOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                  {accessibleSidebarExtensionLinks.map((route) => {
                    const Icon = route.icon;
                    return (
                      <Link key={route.id} to={route.href} className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive(route.href) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                        <div className="w-6 h-6 flex justify-center items-center shrink-0"><Icon size={18} /></div>
                        <span className="ml-3 text-sm font-medium hidden lg:block">{route.label}</span>
                      </Link>
                    );
                  })}
                  <Link to="/extensions" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/extensions') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                    <div className="w-6 h-6 flex justify-center items-center shrink-0"><Puzzle size={18} /></div>
                    <span className="ml-3 text-sm font-medium hidden lg:block">Hub</span>
                  </Link>
                </div>
            </div>

            <div className="border-t border-slate-800 pt-4">
                <button onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)} className="w-full flex items-center justify-between px-3 mb-2 group">
                    <div className="flex items-center gap-2">
                      <div className="lg:hidden w-6 flex justify-center"><Settings size={14} className="text-slate-600" /></div>
                      <span className="hidden lg:block text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">Workspace</span>
                    </div>
                    <ChevronDown size={12} className={`text-slate-700 transition-transform duration-300 hidden lg:block ${isWorkspaceOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>
                <div className={`space-y-1 overflow-hidden transition-all duration-300 ${isWorkspaceOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                  {canAccessCheckpointHub && (
                    <Link to="/checkpoints" className={`flex items-center p-2.5 rounded-lg transition-colors group ${isActive('/checkpoints') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                      <div className="w-6 h-6 flex justify-center items-center shrink-0">
                        <Cpu size={18} className={isActive('/checkpoints') ? 'text-white' : 'text-indigo-400'} />
                      </div>
                      <span className="ml-3 text-sm font-medium hidden lg:block">Checkpoint Hub</span>
                    </Link>
                  )}
                  <Link to="/settings" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/settings') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                    <div className="w-6 h-6 flex justify-center items-center shrink-0"><Settings size={18} /></div>
                    <span className="ml-3 text-sm font-medium hidden lg:block">Settings</span>
                  </Link>
                  <Link to="/archived" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/archived') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                    <div className="w-6 h-6 flex justify-center items-center shrink-0"><Trash2 size={18} /></div>
                    <span className="ml-3 text-sm font-medium hidden lg:block">Deleted</span>
                  </Link>
                  <Link to="/variable-registry" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/variable-registry') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                    <div className="w-6 h-6 flex justify-center items-center shrink-0"><Tag size={18} /></div>
                    <span className="ml-3 text-sm font-medium hidden lg:block">Variable Registry</span>
                  </Link>
                </div>
            </div>

            {isSuperUser && (
                <div className="pt-2">
                    <button onClick={() => setIsSuperOpsOpen(!isSuperOpsOpen)} className="w-full flex items-center justify-between px-3 mb-2 group">
                        <div className="flex items-center gap-2">
                          <div className="lg:hidden w-6 flex justify-center"><Shield size={14} className="text-slate-600" /></div>
                          <span className="hidden lg:block text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">Super User Ops</span>
                        </div>
                        <ChevronDown size={12} className={`text-slate-700 transition-transform duration-300 hidden lg:block ${isSuperOpsOpen ? 'rotate-0' : '-rotate-90'}`} />
                    </button>
                    <div className={`space-y-1 overflow-hidden transition-all duration-300 ${isSuperOpsOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                        <Link to="/intents" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/intents') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                          <div className="w-6 h-6 flex justify-center items-center shrink-0"><BrainCircuit size={18} /></div>
                          <span className="ml-3 text-sm font-medium hidden lg:block">Neural Intents</span>
                        </Link>
                        <Link to="/maintenance" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/maintenance') ? 'bg-purple-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                          <div className="w-6 h-6 flex justify-center items-center shrink-0"><Database size={18} /></div>
                          <span className="ml-3 text-sm font-medium hidden lg:block">System Ops</span>
                        </Link>
                        <Link to="/audit-trail" className={`flex items-center p-2.5 rounded-lg transition-colors ${isActive('/audit-trail') ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>
                          <div className="w-6 h-6 flex justify-center items-center shrink-0"><ListChecks size={18} /></div>
                          <span className="ml-3 text-sm font-medium hidden lg:block">Audit Trail</span>
                        </Link>
                    </div>
                </div>
            )}

            <div className="h-px bg-slate-800 my-2"></div>
            <button onClick={handleLogout} className="flex w-full items-center p-3 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 cursor-pointer transition-colors" title="Logout">
                <div className="w-6 h-6 flex justify-center items-center"><LogOut size={20} /></div>
                <span className="ml-3 text-sm font-medium hidden lg:block">Logout</span>
            </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 lg:px-8 bg-slate-900 z-[100] shrink-0 transition-all duration-500">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex shrink-0 items-center sm:hidden">
                    <BrandMark
                        imageClassName="h-8 w-auto"
                        wordmarkClassName="ml-2 font-bold text-lg text-white"
                    />
                </div>
                <form
                    onSubmit={handleGlobalSearchSubmit}
                    className="hidden w-full max-w-xl items-center gap-2 sm:flex"
                    role="search"
                >
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                        <input
                            type="search"
                            value={globalSearchTerm}
                            onChange={(event) => setGlobalSearchTerm(event.target.value)}
                            placeholder="Search anything..."
                            className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950/80 pl-10 pr-9 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/10"
                        />
                        {globalSearchTerm && (
                            <button
                                type="button"
                                onClick={handleClearGlobalSearch}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-600 transition-colors hover:text-white"
                                aria-label="Clear search"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleGlobalAiChat}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 text-xs font-black uppercase tracking-widest text-cyan-100 transition-colors hover:border-cyan-300/50 hover:bg-cyan-500/20"
                        title="Open AiMa Chat with this search"
                    >
                        <Bot size={14} />
                        AiMa Chat
                    </button>
                </form>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative" ref={creditRef}>
                    <button
                        onClick={() => {
                            setIsCreditOpen(prev => !prev);
                            setIsGoogleCreditOpen(false);
                        }}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all ${pollenBalanceTone.button}`}
                        aria-label="Pollen credit"
                        title="Pollen credit"
                    >
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-black/20">
                            <Flower2 size={16} className={pollenBalanceTone.icon} />
                            {(hasLivePollenCredit || isManualPollenBalance) && (
                                <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${pollenBalanceTone.dot}`} />
                            )}
                        </div>
                        <div className="hidden md:block text-left leading-tight">
                            <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${isManualPollenBalance ? 'text-red-300' : 'text-slate-400'}`}>
                                {isManualPollenBalance ? 'Pollen Credit Manual' : 'Pollen Credit'}
                            </div>
                            <div className="text-xs font-black text-white">
                                {pollenBalanceLabel}
                            </div>
                        </div>
                    </button>

                    {isCreditOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 shadow-2xl z-[120]">
                            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
                                <div>
                                    <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${pollenBalanceTone.label}`}>Pollen Credit</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                        {pollenBalanceDescription}
                                    </div>
                                </div>
                                <button
                                    onClick={handleRefreshPollenBalance}
                                    className={pollenBalanceTone.refresh}
                                >
                                    Refresh
                                </button>
                            </div>

                            <div className="space-y-3 p-4">
                                <div className={pollenBalanceTone.card}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${pollenBalanceTone.cardLabel}`}>
                                                {pollenBalanceModeLabel}
                                            </div>
                                            <div className="mt-2 text-sm font-black text-white">
                                                {pollenBalanceLabel}
                                            </div>
                                        </div>
                                        <div className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${pollenBalanceTone.pill}`}>
                                            Cap {pollenCapLabel}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                                        Last refresh {refreshedAtLabel}. Next auto refresh {refreshAtLabel}.
                                    </p>
                                    {isManualPollenBalance && (
                                        <p className="mt-1 text-[10px] leading-relaxed text-red-300/80">
                                            Manual hourly rate from Settings is active because live Pollinations balance could not be retrieved.
                                        </p>
                                    )}
                                    {pollenBalance.lastUsageLabel && (
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                                            Last deduction: {pollenBalance.lastUsageLabel}{pollenBalance.lastUsageSource ? ` | ${pollenBalance.lastUsageSource}` : ''}
                                        </p>
                                    )}
                                </div>

                                {hasLivePollenCredit ? (
                                    <>
                                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300/80">
                                            <Gauge size={12} /> Model Credit
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.creditRate || 'Rate unavailable'}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.activeModelLabel
                                                ? `${pollenCredit.activeModelLabel}${pollenCredit.creditRateDetail ? ` | ${pollenCredit.creditRateDetail}` : ''}`
                                                : 'Select a model to inspect its Pollinations credit rate.'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/80">
                                            <Flower2 size={12} /> Generation Usage
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.lastPollenUsed || (pollenCredit.isGenerating ? 'Tracking current generation...' : 'No usage recorded yet')}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.lastPollenUsed
                                                ? 'Latest completed generation pollen usage.'
                                                : pollenCredit.isGenerating
                                                    ? 'A live run is in progress and will report usage when it completes.'
                                                : 'Completed runs will report pollen used here.'}
                                        </p>
                                    </div>

                                    <div className={`rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-[10px] leading-relaxed ${pollenModeMeta.accent}`}>
                                        {pollenCredit.isGenerating
                                            ? 'Realtime tracking is active while the studio is generating.'
                                            : 'This panel stays synced with the currently open AI Creative studio.'}
                                    </div>
                                    </>
                                ) : (
                                <div className="px-5 py-6 text-sm text-slate-400">
                                    Open AI Creative Image, Video, Audio, or Chat to see live model credit and last usage here.
                                </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative" ref={googleCreditRef}>
                    <button
                        onClick={() => {
                            setIsGoogleCreditOpen(prev => !prev);
                            setIsCreditOpen(false);
                        }}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all ${
                            hasLiveGoogleCredit
                                ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/15'
                                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        aria-label="Google live usage"
                        title="Google live usage"
                    >
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-black/20">
                            <Cpu size={16} className={hasLiveGoogleCredit ? 'text-indigo-300' : 'text-slate-500'} />
                            {hasLiveGoogleCredit && (
                                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.8)]" />
                            )}
                        </div>
                        <div className="hidden md:block text-left leading-tight">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                                Google Live
                            </div>
                            <div className={`max-w-[10rem] truncate text-xs font-black ${hasLiveGoogleCredit ? 'text-white' : 'text-slate-300'}`}>
                                {googleUsagePreviewLabel}
                            </div>
                        </div>
                    </button>

                    {isGoogleCreditOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 shadow-2xl z-[120]">
                            <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Google Live Usage</div>
                                <div className="mt-1 text-xs text-slate-400">
                                    Latest Gemini request usage for the active studio model.
                                </div>
                            </div>

                            <div className="space-y-3 p-4">
                                {hasLiveGoogleCredit ? (
                                    <>
                                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
                                            <Gauge size={12} /> Last Request Tokens
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.lastGoogleUsage || (pollenCredit.isGenerating ? 'Tracking current generation...' : 'No usage recorded yet')}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.lastGoogleUsage
                                                ? 'Latest Gemini usage metadata from the most recent completed request.'
                                                : pollenCredit.isGenerating
                                                    ? 'Gemini usage metadata will appear after the current run completes.'
                                                    : 'Completed Google runs will report input, output, and total tokens here.'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-sky-300/80">
                                            <Sparkles size={12} /> Model Limit
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.googleQuotaLabel || 'Quota unavailable'}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.activeModelLabel
                                                ? `${pollenCredit.activeModelLabel} registry metadata. This is not your remaining account quota or billing-tier balance.`
                                                : 'Select a Google model to inspect its configured model metadata.'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
                                            <Cpu size={12} /> Google API Rate
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.googleRate || 'Rate unavailable'}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.activeModelLabel
                                                ? `${pollenCredit.activeModelLabel}${pollenCredit.googleRateDetail ? ` | ${pollenCredit.googleRateDetail}` : ''}`
                                                : 'Select a Google model to inspect its current paid-tier rate.'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-violet-300/80">
                                            <Cpu size={12} /> Paid Estimate
                                        </div>
                                        <div className="mt-2 text-sm font-black text-white">
                                            {pollenCredit.lastGoogleCost || 'No estimate yet'}
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                                            {pollenCredit.lastGoogleCost
                                                ? 'Latest paid-tier estimate. Free-tier requests remain free while you stay within Google quota.'
                                                : 'This estimate appears after a completed Google run with usage metadata.'}
                                        </p>
                                    </div>

                                    <div className={`rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-[10px] leading-relaxed ${pollenModeMeta.accent}`}>
                                        {pollenCredit.isGenerating
                                            ? 'Realtime tracking is active while the studio is generating.'
                                            : 'This panel stays synced with the currently open Google-powered AI Creative studio.'}
                                    </div>

                                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-[10px] leading-relaxed text-slate-400">
                                        Account tier, spend caps, and remaining Google quota are not exposed by this app yet.
                                        <a
                                            href="https://aistudio.google.com/app/usage"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-flex items-center gap-1 font-black uppercase tracking-[0.15em] text-indigo-300 hover:text-indigo-200"
                                        >
                                            Open AI Studio Usage <ChevronRight size={12} />
                                        </a>
                                    </div>
                                    </>
                                ) : (
                                    <div className="px-5 py-6 text-sm text-slate-400">
                                        Open AI Creative with a Google model to see live token usage, quota, and estimated cost here.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={handleToggleNotifications}
                        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="Notifications"
                        title="Notifications"
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {isNotifOpen && (
                        <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-[120] overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Notifications</div>
                                <button
                                    onClick={handleClearNotifications}
                                    disabled={!canClearAll}
                                    className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                                    title={canClearAll ? 'Clear all notifications' : 'Read all notifications before clearing'}
                                >
                                    Clear All
                                </button>
                            </div>
                            <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="px-5 py-6 text-center text-[11px] text-slate-500">
                                        No notifications yet.
                                    </div>
                                ) : (
                                    notifications.map((note) => (
                                        <button
                                            key={note.id}
                                            onClick={() => {
                                                markNotificationRead(note.id);
                                                setActiveNotification(note);
                                            }}
                                            className={`w-full text-left px-4 py-3 border-b border-slate-800/60 transition-colors hover:bg-slate-800/50 ${
                                                note.read ? 'text-slate-500' : 'text-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className={`text-[11px] font-bold ${
                                                    note.tone === 'error'
                                                        ? 'text-red-400'
                                                        : note.tone === 'success'
                                                            ? 'text-emerald-400'
                                                            : 'text-slate-300'
                                                }`}>
                                                    {note.title}
                                                </div>
                                                <div className="text-[9px] text-slate-600 font-mono">
                                                    {new Date(note.timestamp).toLocaleTimeString()}
                                                </div>
                                            </div>
                                            {note.message && (
                                                <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{note.message}</p>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <AppLauncher isSuperUser={isSuperUser} />
                <div className="w-px h-6 bg-slate-800 mx-1" />
                {user && (
                    <div className="relative" ref={menuRef}>
                        <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-3 hover:bg-slate-800 p-1.5 pr-3 rounded-full md:rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group">
                            <div className="hidden md:block text-right">
                                <div className="flex items-center gap-2 justify-end">
                                    <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{user.name}</p>
                                    {isSuperUser ? (
                                        <span className="text-[10px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded flex items-center gap-1" title="Root Authority"><Shield size={8} /> SUPER USER</span>
                                    ) : user.role === 'admin' && (
                                        <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded flex items-center gap-1" title="Administrator"><Shield size={8} /> ADMIN</span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">{user.email}</p>
                            </div>
                            {user.avatar ? <img src={user.avatar} alt={user.name} className={`w-9 h-9 rounded-full object-cover border ${isSuperUser ? 'border-purple-500' : user.role === 'admin' ? 'border-red-500' : 'border-indigo-500'}`} /> : <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white">{user.name.substring(0, 2).toUpperCase()}</div>}
                            <ChevronDown size={16} className={`text-slate-500 hidden md:block transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isUserMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                                <Link to="/settings" onClick={() => setIsUserMenuOpen(false)} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-3 transition-colors"><Shield size={16} className="text-indigo-400" /> Security Settings</Link>
                                {user.provider === 'email' && <button onClick={() => { setIsUserMenuOpen(false); setIsPwdModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-3 transition-colors"><Key size={16} className="text-indigo-400" /> Change Password</button>}
                                <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-slate-700 flex items-center gap-3 transition-colors"><LogOut size={16} /> Logout</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 scroll-smooth">{children}</div>
      </main>
      {activeNotification && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800">
                    <div>
                        <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${activeNotification.tone === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                            {activeNotification.tone === 'error' ? 'Failure Alert' : 'Notification'}
                        </div>
                        <h3 className="text-lg font-bold text-white mt-2">{activeNotification.title}</h3>
                    </div>
                    <button
                        onClick={() => {
                            markNotificationRead(activeNotification.id);
                            setActiveNotification(null);
                        }}
                        className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="Close notification"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {activeNotification.message || 'An unexpected failure occurred.'}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => {
                                markNotificationRead(activeNotification.id);
                                setIsNotifOpen(true);
                                setActiveNotification(null);
                            }}
                            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                            View Notifications
                        </button>
                        <button
                            onClick={() => {
                                markNotificationRead(activeNotification.id);
                                setActiveNotification(null);
                            }}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[260] flex flex-col gap-3">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`w-[320px] max-w-[85vw] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
                        toast.tone === 'success'
                            ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200'
                    }`}
                >
                    <div className="text-[10px] font-black uppercase tracking-[0.2em]">
                        {toast.title}
                    </div>
                    {toast.message && (
                        <div className={`text-[11px] mt-1 ${toast.tone === 'success' ? 'text-emerald-100/80' : 'text-slate-300/80'}`}>
                            {toast.message}
                        </div>
                    )}
                </div>
            ))}
        </div>
      )}
      <ChangePasswordModal isOpen={isPwdModalOpen} onClose={() => setIsPwdModalOpen(false)} />
    </div>
  );
};
export default Layout;
