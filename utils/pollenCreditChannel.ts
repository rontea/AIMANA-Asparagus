export type PollenCreditStudioMode = 'image' | 'video' | 'audio' | 'music' | 'transcribe' | 'text';

export interface PollenCreditContext {
    visible: boolean;
    mode?: PollenCreditStudioMode;
    provider?: string | null;
    activeModelLabel?: string | null;
    googleQuotaLabel?: string | null;
    creditRate?: string | null;
    creditRateDetail?: string | null;
    lastPollenUsed?: string | null;
    googleRate?: string | null;
    googleRateDetail?: string | null;
    lastGoogleUsage?: string | null;
    lastGoogleCost?: string | null;
    isGenerating?: boolean;
}

export const POLLEN_CREDIT_CONTEXT_EVENT = 'aimana-pollen-credit-context';

export const dispatchPollenCreditContext = (detail: PollenCreditContext) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(POLLEN_CREDIT_CONTEXT_EVENT, { detail }));
};

export const clearPollenCreditContext = () => {
    dispatchPollenCreditContext({ visible: false });
};
