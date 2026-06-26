const sanitizeTagToken = (value: unknown): string => (
    String(value || '')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

const splitTagString = (value: unknown): string[] => (
    String(value || '')
        .split(',')
        .map((tag) => sanitizeTagToken(tag))
        .filter(Boolean)
);

export const mergeRevisionTags = (...sources: Array<unknown>): string => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    for (const source of sources) {
        if (Array.isArray(source)) {
            for (const entry of source) {
                const tag = sanitizeTagToken(entry);
                const key = tag.toLowerCase();
                if (!tag || seen.has(key)) continue;
                seen.add(key);
                ordered.push(tag);
            }
            continue;
        }

        for (const tag of splitTagString(source)) {
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            ordered.push(tag);
        }
    }

    return ordered.join(', ');
};

export const extractAutoReferenceImageTag = (metadata: any): string => {
    if (!metadata || typeof metadata !== 'object') return '';

    const direct = sanitizeTagToken(metadata.referenceImageTag);
    if (direct) return direct;

    const advanced = metadata.advanced_params;
    if (advanced && typeof advanced === 'object') {
        return sanitizeTagToken(advanced.referenceImageTag);
    }

    return '';
};
