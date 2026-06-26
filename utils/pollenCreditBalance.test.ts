import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_POLLEN_CREDIT_BALANCE,
    consumePollenCredit,
    getPollenCreditBalanceState,
    getManualPollenCreditFallbackRate,
    POLLEN_CREDIT_BALANCE_STORAGE_KEY,
    refreshPollenCreditBalance,
    refreshPollenCreditBalanceFromAccount,
    setManualPollenCreditFallbackRate,
    syncPollenCreditBalance
} from './pollenCreditBalance';

describe('pollenCreditBalance hourly scheduling', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    it('aligns a fresh balance window to the top of the current hour', () => {
        const now = new Date('2026-04-23T10:23:45.000Z').getTime();

        const state = getPollenCreditBalanceState({ notify: false, now });

        expect(state.balance).toBe(DEFAULT_POLLEN_CREDIT_BALANCE);
        expect(state.refreshedAt).toBe(new Date('2026-04-23T10:00:00.000Z').getTime());
        expect(state.nextRefreshAt).toBe(new Date('2026-04-23T11:00:00.000Z').getTime());
        expect(state.lastUpdatedAt).toBe(now);
    });

    it('refreshes on the next hour boundary instead of waiting a rolling hour', () => {
        const firstSeenAt = new Date('2026-04-23T10:23:45.000Z').getTime();
        getPollenCreditBalanceState({ notify: false, now: firstSeenAt });

        const refreshed = syncPollenCreditBalance(new Date('2026-04-23T11:00:00.000Z').getTime());

        expect(refreshed.refreshedAt).toBe(new Date('2026-04-23T11:00:00.000Z').getTime());
        expect(refreshed.nextRefreshAt).toBe(new Date('2026-04-23T12:00:00.000Z').getTime());
        expect(refreshed.balance).toBe(DEFAULT_POLLEN_CREDIT_BALANCE);
    });

    it('keeps the current window when manually refreshed before the next hour', () => {
        const now = new Date('2026-04-23T10:23:45.000Z').getTime();
        getPollenCreditBalanceState({ notify: false, now });

        const refreshed = refreshPollenCreditBalance('manual', new Date('2026-04-23T10:40:00.000Z').getTime());

        expect(refreshed.refreshedAt).toBe(new Date('2026-04-23T10:00:00.000Z').getTime());
        expect(refreshed.nextRefreshAt).toBe(new Date('2026-04-23T11:00:00.000Z').getTime());
    });

    it('migrates stored legacy data to the next top-of-hour refresh window', () => {
        window.localStorage.setItem(POLLEN_CREDIT_BALANCE_STORAGE_KEY, JSON.stringify({
            balance: 0.04,
            cap: DEFAULT_POLLEN_CREDIT_BALANCE,
            refreshedAt: new Date('2026-04-23T10:23:45.000Z').getTime(),
            nextRefreshAt: new Date('2026-04-23T11:23:45.000Z').getTime(),
            lastUpdatedAt: new Date('2026-04-23T10:30:00.000Z').getTime(),
            lastUsageAmount: 0.009,
            lastUsageLabel: '0.009 pollen',
            lastUsageSource: 'AI Chat',
            accountBalance: null,
            pendingUsageAmount: 0,
            source: 'local-estimate'
        }));

        const state = getPollenCreditBalanceState({ notify: false, now: new Date('2026-04-23T10:40:00.000Z').getTime() });

        expect(state.refreshedAt).toBe(new Date('2026-04-23T10:23:45.000Z').getTime());
        expect(state.nextRefreshAt).toBe(new Date('2026-04-23T11:00:00.000Z').getTime());
    });

    it('aligns stored pollinations account balances to the next hour boundary', () => {
        window.localStorage.setItem(POLLEN_CREDIT_BALANCE_STORAGE_KEY, JSON.stringify({
            balance: 2.4,
            cap: 3,
            refreshedAt: new Date('2026-04-23T10:23:45.000Z').getTime(),
            nextRefreshAt: new Date('2026-04-23T10:24:45.000Z').getTime(),
            lastUpdatedAt: new Date('2026-04-23T10:23:50.000Z').getTime(),
            lastUsageAmount: null,
            lastUsageLabel: null,
            lastUsageSource: null,
            accountBalance: 2.4,
            pendingUsageAmount: 0,
            source: 'pollinations-account'
        }));

        const state = getPollenCreditBalanceState({ notify: false, now: new Date('2026-04-23T10:40:00.000Z').getTime() });

        expect(state.nextRefreshAt).toBe(new Date('2026-04-23T11:00:00.000Z').getTime());
    });

    it('uses the configured manual fallback pollen rate for fresh manual windows', () => {
        setManualPollenCreditFallbackRate(0.33);

        const state = getPollenCreditBalanceState({ notify: false, now: new Date('2026-04-23T10:23:45.000Z').getTime() });

        expect(getManualPollenCreditFallbackRate()).toBe(0.33);
        expect(state.balance).toBe(0.33);
        expect(state.cap).toBe(0.33);
        expect(state.source).toBe('manual-fallback');
    });

    it('treats refreshed live account balance as authoritative over stale pending usage', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                balance: 0.01,
                cap: 0.01,
                source: 'pollinations-account'
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        window.localStorage.setItem(POLLEN_CREDIT_BALANCE_STORAGE_KEY, JSON.stringify({
            balance: 0,
            cap: 0.01,
            refreshedAt: new Date('2026-04-23T10:00:00.000Z').getTime(),
            nextRefreshAt: new Date('2026-04-23T11:00:00.000Z').getTime(),
            lastUpdatedAt: new Date('2026-04-23T10:30:00.000Z').getTime(),
            lastUsageAmount: 0.4,
            lastUsageLabel: '0.4 pollen',
            lastUsageSource: 'AI Creative',
            accountBalance: 0.01,
            pendingUsageAmount: 16.1,
            source: 'pollinations-account'
        }));

        const state = await refreshPollenCreditBalanceFromAccount();

        expect(state?.balance).toBe(0.01);
        expect(state?.accountBalance).toBe(0.01);
        expect(state?.pendingUsageAmount).toBe(0);
        expect(state?.source).toBe('pollinations-account');

        const consumed = consumePollenCredit(0.004, 'Test Generation');
        expect(consumed.balance).toBe(0.006);
        expect(consumed.pendingUsageAmount).toBe(0.004);
    });
});
