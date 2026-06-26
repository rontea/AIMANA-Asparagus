import React from 'react';
import { EngineFeatures } from '../../../hooks/useEngineManagement';
import { PresetGrid } from './Controls/PresetGrid';
import { LogicEnvironment } from './Controls/LogicEnvironment';
import { VariableStudio } from './Controls/VariableStudio';

interface ControlsTabProps {
    features: EngineFeatures;
    onToggleFeature: (key: keyof EngineFeatures) => void;
    uiSchema: any[];
    onAddParam: (blueprintKey: string) => void;
    onUpdateParam: (index: number, updates: any) => void;
    onRemoveParam: (index: number) => void;
    onReplaceSchema: (newSchema: any[]) => void;
    onExport: () => void;
    onImport: (file: File) => void;
    formData: any;
    onUpdateFormData: (data: any) => void;
}

export const ControlsTab: React.FC<ControlsTabProps> = ({ 
    features, onToggleFeature, uiSchema, onAddParam, onUpdateParam, onRemoveParam, onReplaceSchema, onExport, onImport,
    formData, onUpdateFormData
}) => {
    return (
        <div className="space-y-12 animate-in fade-in">
            {/* 1. Feature Toggles */}
            <PresetGrid features={features} onToggleFeature={onToggleFeature} category={formData.category} />

            <div className="h-px bg-slate-800" />

            {/* 2. Persistent Context */}
            <LogicEnvironment 
                defaultNegativePrompt={formData.defaultNegativePrompt || ''}
                onChange={(val) => onUpdateFormData({ ...formData, defaultNegativePrompt: val })}
            />

            <div className="h-px bg-slate-800" />

            {/* 3. Custom Parameter Builder */}
            <VariableStudio 
                uiSchema={uiSchema} 
                onAddParam={onAddParam} 
                onUpdateParam={onUpdateParam} 
                onRemoveParam={onRemoveParam} 
                onReplaceSchema={onReplaceSchema}
                onExport={onExport}
                onImport={onImport}
                category={formData.category}
                features={features}
            />
        </div>
    );
};
