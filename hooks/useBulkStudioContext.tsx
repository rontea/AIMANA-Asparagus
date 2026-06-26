import React, { createContext, useContext } from 'react';
import { useBulkStudio } from './useBulkStudio';
import { useLabState } from './useLabState';

type BulkStudioContextValue = {
    labState: ReturnType<typeof useLabState>;
    bulkStudio: ReturnType<typeof useBulkStudio>;
};

const BulkStudioContext = createContext<BulkStudioContextValue | null>(null);

export const BulkStudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const labState = useLabState();
    const bulkStudio = useBulkStudio(labState);

    return (
        <BulkStudioContext.Provider value={{ labState, bulkStudio }}>
            {children}
        </BulkStudioContext.Provider>
    );
};

export const useBulkStudioContext = () => {
    const context = useContext(BulkStudioContext);
    if (!context) {
        throw new Error('useBulkStudioContext must be used within BulkStudioProvider');
    }
    return context;
};
