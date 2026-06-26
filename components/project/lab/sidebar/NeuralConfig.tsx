
import React from 'react';
import { LabModelManager } from './LabModelManager';
import { SupportedEngine, ModelOption } from '../ModelSelectorModal';

interface NeuralConfigProps {
    model: SupportedEngine;
    registry: ModelOption[];
    onOpenModal: () => void;
    onOpenLoraModal: () => void;
    onOpenEmbeddingModal: () => void;
    onOpenControlNetModal: () => void;
    onAddTriggerWord: (word: string) => void;
    vae: string;
    onSetVae: (v: string) => void;
}

export const NeuralConfig: React.FC<NeuralConfigProps> = (props) => (
    <div className="space-y-6 animate-in fade-in duration-300">
        <LabModelManager {...props} />
    </div>
);
