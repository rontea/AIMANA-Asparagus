
import { useState, useMemo, useEffect } from 'react';
import { ItemWithCurrentRevision } from '../types';
import { AssetSortType, sortAssets } from '../utils/assetSorting';

export type AssetViewType = 'grid' | 'list' | 'gallery' | 'group';

interface UseAssetFiltersProps {
    items: ItemWithCurrentRevision[];
    storageKeyPrefix: string;
}

export const useAssetFilters = ({ items, storageKeyPrefix }: UseAssetFiltersProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortType, setSortType] = useState<AssetSortType>(() => 
        (localStorage.getItem(`${storageKeyPrefix}_sort`) as AssetSortType) || 'newest'
    );
    const [viewType, setViewType] = useState<AssetViewType>(() => 
        (localStorage.getItem(`${storageKeyPrefix}_view`) as AssetViewType) || 'grid'
    );

    useEffect(() => {
        localStorage.setItem(`${storageKeyPrefix}_sort`, sortType);
    }, [sortType, storageKeyPrefix]);

    useEffect(() => {
        localStorage.setItem(`${storageKeyPrefix}_view`, viewType);
    }, [viewType, storageKeyPrefix]);

    const filteredAndSortedItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (!searchTerm) return true;
            const lowSearch = searchTerm.toLowerCase();
            const rev = item.currentRevision;
            return (
                rev?.title.toLowerCase().includes(lowSearch) || 
                rev?.prompt.toLowerCase().includes(lowSearch) ||
                rev?.note.toLowerCase().includes(lowSearch)
            );
        });

        return sortAssets(filtered, sortType);
    }, [items, searchTerm, sortType]);

    return {
        searchTerm,
        setSearchTerm,
        sortType,
        setSortType,
        viewType,
        setViewType,
        filteredAndSortedItems
    };
};
