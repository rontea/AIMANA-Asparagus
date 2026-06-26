import { formatPollenAmount } from './pollenCredits';

export interface PollenCreditBalanceState {
    balance: number;
    cap: number;
    refreshedAt: number;
    nextRefreshAt: number;
    lastUpdatedAt: number;
    lastUsageAmount: number | null;
    lastUsageLabel: string | null;
    lastUsageSource: string | null;
    accountBalance: number | null;
    pendingUsageAmount: number;
    source: 'local-estimate' | 'pollinations-account' | 'manual-fallback';
}

export const POLLEN_CREDIT_BALANCE_EVENT = 'aimana-pollen-credit-balance';
export const POLLEN_CREDIT_BALANCE_STORAGE_KEY = 'aimana_pollen_credit_balance_v1';
export const POLLEN_CREDIT_MANUAL_RATE_STORAGE_KEY = 'aimana_pollen_credit_manual_rate_v1';
export const DEFAULT_POLLEN_CREDIT_BALANCE = 0.15;
export const POLLEN_CREDIT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const POLLEN_CREDIT_ACCOUNT_BALANCE_ENDPOINT = '/api/proxy/pollinations/account/balance';

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const getHourWindowStart = (now = Date.now()) => Math.floor(now / POLLEN_CREDIT_REFRESH_INTERVAL_MS) * POLLEN_CREDIT_REFRESH_INTERVAL_MS;
const getNextRefreshAt = (now = Date.now()) => getHourWindowStart(now) + POLLEN_CREDIT_REFRESH_INTERVAL_MS;
const getNextAccountRefreshAt = (now = Date.now()) => getNextRefreshAt(now);

export const getManualPollenCreditFallbackRate = (): number => {
    if (typeof window === 'undefined') return DEFAULT_POLLEN_CREDIT_BALANCE;
    try {
        const raw = window.localStorage.getItem(POLLEN_CREDIT_MANUAL_RATE_STORAGE_KEY);
        const parsed = toFiniteNumber(raw);
        return parsed !== null && parsed > 0 ? parsed : DEFAULT_POLLEN_CREDIT_BALANCE;
    } catch {
        return DEFAULT_POLLEN_CREDIT_BALANCE;
    }
};

export const setManualPollenCreditFallbackRate = (amount: unknown): number => {
    const parsed = toFiniteNumber(amount);
    const next = parsed !== null && parsed > 0 ? parsed : DEFAULT_POLLEN_CREDIT_BALANCE;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(POLLEN_CREDIT_MANUAL_RATE_STORAGE_KEY, String(next));
    }
    return next;
};

const createFreshState = (now = Date.now()): PollenCreditBalanceState => ({
    balance: getManualPollenCreditFallbackRate(),
    cap: getManualPollenCreditFallbackRate(),
    refreshedAt: getHourWindowStart(now),
    nextRefreshAt: getNextRefreshAt(now),
    lastUpdatedAt: now,
    lastUsageAmount: null,
    lastUsageLabel: null,
    lastUsageSource: null,
    accountBalance: null,
    pendingUsageAmount: 0,
    source: 'manual-fallback'
});

const readStoredState = (): PollenCreditBalanceState | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(POLLEN_CREDIT_BALANCE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;

        const cap = toFiniteNumber(parsed.cap) ?? DEFAULT_POLLEN_CREDIT_BALANCE;
        const balance = toFiniteNumber(parsed.balance) ?? cap;
        const refreshedAt = toFiniteNumber(parsed.refreshedAt) ?? Date.now();
        const lastUpdatedAt = toFiniteNumber(parsed.lastUpdatedAt) ?? refreshedAt;
        const lastUsageAmount = toFiniteNumber(parsed.lastUsageAmount);
        const accountBalance = toFiniteNumber(parsed.accountBalance);
        const pendingUsageAmount = Math.max(0, toFiniteNumber(parsed.pendingUsageAmount) ?? 0);
        const source = parsed.source === 'pollinations-account'
            ? 'pollinations-account'
            : parsed.source === 'manual-fallback'
                ? 'manual-fallback'
                : 'local-estimate';
        const nextRefreshAt = source === 'pollinations-account'
            ? (toFiniteNumber(parsed.nextRefreshAt) ?? getNextAccountRefreshAt(refreshedAt))
            : getNextRefreshAt(refreshedAt);

        return {
            balance: Math.max(0, balance),
            cap: Math.max(0, cap),
            refreshedAt,
            nextRefreshAt,
            lastUpdatedAt,
            lastUsageAmount,
            lastUsageLabel: typeof parsed.lastUsageLabel === 'string' ? parsed.lastUsageLabel : null,
            lastUsageSource: typeof parsed.lastUsageSource === 'string' ? parsed.lastUsageSource : null,
            accountBalance,
            pendingUsageAmount,
            source
        };
    } catch (_error) {
        return null;
    }
};

const writeState = (state: PollenCreditBalanceState) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(POLLEN_CREDIT_BALANCE_STORAGE_KEY, JSON.stringify(state));
};

const dispatchState = (state: PollenCreditBalanceState) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(POLLEN_CREDIT_BALANCE_EVENT, { detail: state }));
};

const normalizeState = (state: PollenCreditBalanceState | null, now = Date.now()): PollenCreditBalanceState => {
    const current = state || createFreshState(now);
    if (now < current.nextRefreshAt) return current;
    if (current.source === 'pollinations-account') {
        return {
            ...current,
            nextRefreshAt: getNextAccountRefreshAt(now)
        };
    }

    return {
        ...createFreshState(now),
        lastUsageAmount: current.lastUsageAmount,
        lastUsageLabel: current.lastUsageLabel,
        lastUsageSource: current.lastUsageSource
    };
};

const persistState = (state: PollenCreditBalanceState, notify = true) => {
    writeState(state);
    if (notify) dispatchState(state);
    return state;
};

export const getPollenCreditBalanceState = (options?: { notify?: boolean; now?: number }) => {
    const next = normalizeState(readStoredState(), options?.now);
    return persistState(next, options?.notify !== false);
};

export const refreshPollenCreditBalance = (reason: 'manual' | 'hourly' = 'manual', now = Date.now()) => {
    const previous = readStoredState();
    if (previous && now < previous.nextRefreshAt) {
        if (reason === 'manual' && previous.source !== 'pollinations-account') {
            const next = {
                ...previous,
                balance: getManualPollenCreditFallbackRate(),
                cap: getManualPollenCreditFallbackRate(),
                refreshedAt: getHourWindowStart(now),
                nextRefreshAt: getNextRefreshAt(now),
                lastUpdatedAt: now,
                pendingUsageAmount: 0,
                source: 'manual-fallback' as const
            };
            return persistState(next, true);
        }
        return persistState(normalizeState(previous, now), true);
    }
    if (previous?.source === 'pollinations-account') {
        return persistState({
            ...previous,
            refreshedAt: now,
            nextRefreshAt: getNextAccountRefreshAt(now),
            lastUpdatedAt: now
        }, true);
    }

    const next = {
        ...createFreshState(now),
        lastUsageAmount: previous?.lastUsageAmount ?? null,
        lastUsageLabel: previous?.lastUsageLabel ?? null,
        lastUsageSource: previous?.lastUsageSource ?? null,
        source: 'manual-fallback' as const
    };
    return persistState(next, true);
};

export const syncPollenCreditBalance = (now = Date.now()) => {
    const current = readStoredState();
    if (!current) return getPollenCreditBalanceState({ now });
    if (now < current.nextRefreshAt) return persistState(current, false);
    if (current.source === 'pollinations-account') {
        return persistState({
            ...current,
            nextRefreshAt: getNextAccountRefreshAt(now)
        }, false);
    }
    return refreshPollenCreditBalance('hourly', now);
};

const getBalanceFromPayload = (payload: unknown): number | null => {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as {
        balance?: unknown;
        estimatedBalance?: unknown;
        data?: { balance?: unknown; estimatedBalance?: unknown };
    };
    const direct = toFiniteNumber(data.balance);
    if (direct !== null) return Math.max(0, direct);
    const directEstimate = toFiniteNumber(data.estimatedBalance);
    if (directEstimate !== null) return Math.max(0, directEstimate);
    const nested = toFiniteNumber(data.data?.balance);
    if (nested !== null) return Math.max(0, nested);
    const nestedEstimate = toFiniteNumber(data.data?.estimatedBalance);
    if (nestedEstimate !== null) return Math.max(0, nestedEstimate);
    return null;
};

const getCapFromPayload = (payload: unknown, fallbackBalance: number): number => {
    if (!payload || typeof payload !== 'object') return Math.max(0, fallbackBalance);
    const data = payload as { cap?: unknown; data?: { cap?: unknown } };
    const direct = toFiniteNumber(data.cap);
    if (direct !== null) return Math.max(0, direct);
    const nested = toFiniteNumber(data.data?.cap);
    if (nested !== null) return Math.max(0, nested);
    return Math.max(0, fallbackBalance);
};

export const refreshPollenCreditBalanceFromAccount = async () => {
    if (typeof window === 'undefined') return null;

    try {
        const response = await window.fetch(POLLEN_CREDIT_ACCOUNT_BALANCE_ENDPOINT, {
            method: 'GET'
        });
        if (!response.ok) return null;

        const payload = await response.json().catch(() => ({}));
        const balance = getBalanceFromPayload(payload);
        if (balance === null) return null;

        const now = Date.now();
        const current = getPollenCreditBalanceState({ notify: false, now });
        const payloadSource = typeof (payload as { source?: unknown })?.source === 'string'
            ? String((payload as { source?: unknown }).source)
            : '';
        const normalizedSource = payloadSource === 'pollinations-account'
            ? 'pollinations-account'
            : payloadSource === 'manual-fallback'
                ? 'manual-fallback'
                : 'local-estimate';
        const isLiveAccountBalance = normalizedSource === 'pollinations-account';
        const next: PollenCreditBalanceState = {
            ...current,
            balance: Math.max(0, balance),
            cap: getCapFromPayload(payload, balance),
            refreshedAt: now,
            nextRefreshAt: isLiveAccountBalance ? getNextAccountRefreshAt(now) : getNextRefreshAt(now),
            lastUpdatedAt: now,
            accountBalance: isLiveAccountBalance ? balance : null,
            pendingUsageAmount: 0,
            source: normalizedSource
        };
        return persistState(next, true);
    } catch {
        return null;
    }
};

export const consumePollenCredit = (amount: unknown, source = 'Generation') => {
    const parsedAmount = toFiniteNumber(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
        return getPollenCreditBalanceState({ notify: false });
    }

    const current = getPollenCreditBalanceState({ notify: false });
    const next: PollenCreditBalanceState = {
        ...current,
        balance: Math.max(0, current.balance - parsedAmount),
        lastUpdatedAt: Date.now(),
        lastUsageAmount: parsedAmount,
        lastUsageLabel: `${formatPollenAmount(parsedAmount)} pollen`,
        lastUsageSource: source,
        pendingUsageAmount: current.source === 'pollinations-account'
            ? Math.max(0, current.pendingUsageAmount + parsedAmount)
            : current.pendingUsageAmount
    };
    return persistState(next, true);
};
