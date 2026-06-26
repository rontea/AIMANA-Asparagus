import { ItemWithCurrentRevision } from '../types';

export type AssetSortType = 'newest' | 'oldest' | 'alphabetical' | 'size' | 'modified-new' | 'modified-old' | 'date-new' | 'date-old' | 'forge-reference';

const parseAiParams = (raw?: string) => {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const getAdvancedParams = (item: ItemWithCurrentRevision): Record<string, any> | null => {
    const rev = item.currentRevision;
    if (!rev?.aiParameters) return null;

    const parsed = parseAiParams(rev.aiParameters);
    if (!parsed || typeof parsed !== 'object') return null;

    const params = parsed as Record<string, any>;
    return params.advanced_params && typeof params.advanced_params === 'object'
        ? params.advanced_params
        : params;
};

const getReferenceItemIds = (item: ItemWithCurrentRevision): string[] => {
    const adv = getAdvancedParams(item);
    if (!adv) return [];

    const list = Array.isArray(adv.referenceItemIds)
        ? adv.referenceItemIds.filter((id: any) => typeof id === 'string' && id.trim())
        : [];
    const single = typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()
        ? [adv.referenceItemId]
        : [];

    return Array.from(new Set([...list, ...single]));
};

const isForgeReferenceSource = (item: ItemWithCurrentRevision): boolean => {
    const rev = item.currentRevision;
    if (!rev) return false;

    if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
    if (rev.fileUrl?.includes('/Neural_Reference/')) return true;

    const adv = getAdvancedParams(item);
    if (!adv) return false;

    return !!(
        (adv.isReference && !adv.parentItemId) ||
        adv.referenceAsset === true ||
        adv.reference_artifact === true ||
        adv.referenceArtifact === true ||
        adv.source === 'reference_upload' ||
        adv.source === 'reference_drop' ||
        adv.source === 'selector_ingest'
    );
};

const getCreatedTimestamp = (item: ItemWithCurrentRevision): number => {
    const revisionCreatedAt = Number(item.currentRevision?.createdAt || 0);
    const itemCreatedAt = Number(item.createdAt || 0);
    return revisionCreatedAt || itemCreatedAt || 0;
};

const getModifiedTimestamp = (item: ItemWithCurrentRevision): number => {
    const itemUpdatedAt = Number(item.updatedAt || 0);
    const createdAt = getCreatedTimestamp(item);
    return Math.max(itemUpdatedAt, createdAt);
};

export const sortAssets = (items: ItemWithCurrentRevision[], sortType: AssetSortType): ItemWithCurrentRevision[] => {
    if (sortType === 'forge-reference') {
        const sourceItems = items
            .filter(isForgeReferenceSource)
            .sort((a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a));

        const sourceOrder = sourceItems.map((item) => item.id);
        const sourceIdSet = new Set(sourceOrder);

        const childrenBySource = new Map<string, ItemWithCurrentRevision[]>();
        sourceOrder.forEach((id) => childrenBySource.set(id, []));

        const assignedChildIds = new Set<string>();
        const unassignedReferenced: ItemWithCurrentRevision[] = [];
        const unlinked: ItemWithCurrentRevision[] = [];

        for (const item of items) {
            if (sourceIdSet.has(item.id)) continue;

            const refs = getReferenceItemIds(item);
            if (refs.length === 0) {
                unlinked.push(item);
                continue;
            }

            const linkedSourceId = sourceOrder.find((sourceId) => refs.includes(sourceId));
            if (!linkedSourceId) {
                unassignedReferenced.push(item);
                continue;
            }

            childrenBySource.get(linkedSourceId)?.push(item);
            assignedChildIds.add(item.id);
        }

        const result: ItemWithCurrentRevision[] = [];

        for (const sourceId of sourceOrder) {
            const source = sourceItems.find((item) => item.id === sourceId);
            if (!source) continue;
            result.push(source);

            const children = (childrenBySource.get(sourceId) || [])
                .sort((a, b) => getCreatedTimestamp(a) - getCreatedTimestamp(b)); // First generation first
            result.push(...children);
        }

        const leftovers = [...unassignedReferenced, ...unlinked]
            .filter((item) => !assignedChildIds.has(item.id))
            .sort((a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a));

        result.push(...leftovers);
        return result;
    }

    return [...items].sort((a, b) => {
        const revA = a.currentRevision;
        const revB = b.currentRevision;
        if (!revA || !revB) return 0;
        
        switch (sortType) {
            case 'oldest':
            case 'date-old':
                return getCreatedTimestamp(a) - getCreatedTimestamp(b);
            case 'modified-new':
                return getModifiedTimestamp(b) - getModifiedTimestamp(a);
            case 'modified-old':
                return getModifiedTimestamp(a) - getModifiedTimestamp(b);
            case 'alphabetical':
                return revA.title.localeCompare(revB.title);
            case 'size':
                return revB.size - revA.size;
            case 'newest':
            case 'date-new':
            default:
                return getCreatedTimestamp(b) - getCreatedTimestamp(a);
        }
    });
};
