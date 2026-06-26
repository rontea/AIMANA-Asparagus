import React from 'react';
import { LabInputForm } from '../sidebar/LabInputForm';
import { SupportedEngine } from '../ModelSelectorModal';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';

interface NeuralCommandBarProps {
    title: string;
    onSetTitle: (t: string) => void;
    prompt: string;
    onSetPrompt: (p: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    category: string;
    model: SupportedEngine;
    hasApiKey: boolean;
    negativePrompt: string;
    onSetNegativePrompt: (p: string) => void;
    onRandomizeSeed: () => void;
    selectedRatio: string;
    onSetRatio: (r: string) => void;
    features: EngineFeatures;
}

export const NeuralCommandBar: React.FC<NeuralCommandBarProps> = (props) => {
    return (
        <div className="min-h-full px-6 md:px-10 py-6 bg-[#0c0c0c]/80 backdrop-blur-xl z-50 shadow-2xl relative">
            <div className="max-w-5xl mx-auto flex min-h-full flex-col gap-4">
                <div className="relative">
                    <LabInputForm {...props} />
                </div>
            </div>
        </div>
    );
};
