const workspaceRoutePattern = /^\/(?:prompt-manager(?:[/?#]|$)|project\/)/;

const getWindowOrigin = () => (
    typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : ''
);

const getWindowHref = () => (
    typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : 'http://localhost/'
);

export const workspaceHostAliases = () => {
    const configured = String((import.meta as any)?.env?.VITE_AIMANA_WORKSPACE_HOSTS || '')
        .split(/[,\n;|]/)
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
    const currentHost = typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname.toLowerCase()
        : '';
    return new Set(['aimana.ai', 'www.aimana.ai', currentHost, ...configured].filter(Boolean));
};

export const isWorkspaceRoute = (value: string) => workspaceRoutePattern.test(String(value || '').trim());

const routeFromHash = (hash: string) => {
    const raw = String(hash || '').trim();
    if (!raw.startsWith('#/')) return '';
    const route = raw.slice(1);
    return isWorkspaceRoute(route) ? route : '';
};

export const getWorkspaceRouteFromSourceUrl = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith('#/')) {
        const route = raw.slice(1);
        return isWorkspaceRoute(route) ? route : '';
    }

    if (raw.startsWith('/#/')) {
        const route = raw.slice(2);
        return isWorkspaceRoute(route) ? route : '';
    }

    try {
        const parsed = new URL(raw, getWindowHref());
        const hashRoute = routeFromHash(parsed.hash);
        if (hashRoute && workspaceHostAliases().has(parsed.hostname.toLowerCase())) return hashRoute;

        const route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (isWorkspaceRoute(route) && workspaceHostAliases().has(parsed.hostname.toLowerCase())) {
            return route;
        }
    } catch {
        if (isWorkspaceRoute(raw)) return raw;
    }

    return '';
};

export const rewriteWorkspaceSourceUrl = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const workspaceRoute = getWorkspaceRouteFromSourceUrl(raw);
    if (workspaceRoute) return `${getWindowOrigin()}/#${workspaceRoute}`;

    try {
        return new URL(raw, getWindowHref()).toString();
    } catch {
        return raw;
    }
};

export const isWorkspaceSourceUrl = (value: string) => Boolean(getWorkspaceRouteFromSourceUrl(value));
