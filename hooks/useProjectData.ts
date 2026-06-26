
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Project, ProjectCollection, ItemWithCurrentRevision } from '../types';

export const useProjectData = (projectId: string | undefined) => {
    const [project, setProject] = useState<Project | null>(null);
    const [collections, setCollections] = useState<ProjectCollection[]>([]);
    const [items, setItems] = useState<ItemWithCurrentRevision[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async (isInitial = false) => {
        if (!projectId) return;
        if (isInitial) setLoading(true);
        try {
            const [p, i] = await Promise.all([
                api.projects.get(projectId),
                api.items.list(projectId, false)
            ]);
            if (p) setProject(p);
            setItems(i);
            if (isInitial) {
                api.collections.list(projectId)
                    .then(setCollections)
                    .catch((e) => console.error("Collection load failed", e));
            } else {
                const c = await api.collections.list(projectId);
                setCollections(c);
            }
        } catch (e) {
            console.error("Data load failed", e);
        } finally {
            if (isInitial) setLoading(false);
        }
    }, [projectId]);

    useEffect(() => { loadData(true); }, [loadData]);

    return { 
        project, 
        setProject, 
        collections,
        setCollections,
        items, 
        setItems, 
        loading, 
        refresh: () => loadData(false) 
    };
};
