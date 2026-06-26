import React, { useEffect } from 'react';
import { useEngineManagement } from '../../../hooks/useEngineManagement';
import { IdentityTab } from './IdentityTab';
import { NetworkTab } from './NetworkTab';
import { ControlsTab } from './ControlsTab';
import { DirectiveTab } from './DirectiveTab';
import { IntelligenceTab } from './IntelligenceTab';
import { SandboxTab } from './SandboxTab';
import { TextSandboxTab } from './TextSandboxTab';
import { ModalHeader } from './Layout/ModalHeader';
import { ModalFooter } from './Layout/ModalFooter';
import { ModalTabs } from './Layout/ModalTabs';

interface ManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    engine?: any;
}

export const ManagementModal: React.FC<ManagementModalProps> = ({ isOpen, onClose, engine }) => {
    const isNew = !engine;
    const {
        activeTab, setActiveTab,
        formData, setFormData,
        features, toggleFeature,
        uiSchema, addParamFromBlueprint, updateParam, removeParam, replaceSchema,
        isSaving, showSuccess, error,
        testPrompt, setTestPrompt, 
        testImage, setTestImage,
        textSandboxImageInput, setTextSandboxImageInput,
        textSandboxAudioData, setTextSandboxAudioData,
        textSandboxAudioFormat, setTextSandboxAudioFormat,
        textSandboxVideoInput, setTextSandboxVideoInput,
        runSandboxTest, isTesting, testResult, testError,
        handleSave,
        checkAndTest,
        exportBlueprint,
        importBlueprint,
        applyPollinationsStarter
    } = useEngineManagement(engine, isNew, onClose);

    // Reset tab to Identity if the user switches to Static while in a hidden tab
    useEffect(() => {
        const hiddenForStaticTabs = ['logic', 'ui', 'advanced', 'test'];
        if (formData.category === 'Static' && hiddenForStaticTabs.includes(activeTab)) {
            setActiveTab('meta');
        }
    }, [formData.category, activeTab, setActiveTab]);

    if (!isOpen) return null;

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'meta':
                return <IdentityTab formData={formData} setFormData={setFormData} isNew={isNew} />;
            case 'logic':
                return (
                    <NetworkTab
                        formData={formData}
                        setFormData={setFormData}
                        onValidate={checkAndTest}
                        isTesting={isTesting}
                        onApplyPollinationsStarter={applyPollinationsStarter}
                    />
                );
            case 'ui':
                return (
                    <ControlsTab 
                        features={features} 
                        onToggleFeature={toggleFeature} 
                        uiSchema={uiSchema} 
                        onAddParam={addParamFromBlueprint} 
                        onUpdateParam={updateParam} 
                        onRemoveParam={removeParam}
                        onReplaceSchema={replaceSchema}
                        onExport={exportBlueprint}
                        onImport={importBlueprint}
                        formData={formData}
                        onUpdateFormData={setFormData}
                    />
                );
            case 'advanced':
                return <DirectiveTab formData={formData} setFormData={setFormData} />;
            case 'intelligence':
                return <IntelligenceTab formData={formData} setFormData={setFormData} />;
            case 'test':
                return formData.category === 'Language' ? (
                    <TextSandboxTab
                        testPrompt={testPrompt}
                        onSetTestPrompt={setTestPrompt}
                        textSandboxImageInput={textSandboxImageInput}
                        onSetTextSandboxImageInput={setTextSandboxImageInput}
                        textSandboxAudioData={textSandboxAudioData}
                        onSetTextSandboxAudioData={setTextSandboxAudioData}
                        textSandboxAudioFormat={textSandboxAudioFormat}
                        onSetTextSandboxAudioFormat={setTextSandboxAudioFormat}
                        textSandboxVideoInput={textSandboxVideoInput}
                        onSetTextSandboxVideoInput={setTextSandboxVideoInput}
                        onRunTest={runSandboxTest}
                        isTesting={isTesting}
                        testResult={testResult}
                        testError={testError}
                        isUrlDefined={!!formData.requestUrl}
                        isTested={formData.isTested}
                        onSetTested={(v) => setFormData({ ...formData, isTested: v })}
                        formData={formData}
                        setFormData={setFormData}
                    />
                ) : (
                    <SandboxTab 
                        testPrompt={testPrompt} 
                        onSetTestPrompt={setTestPrompt} 
                        testImage={testImage}
                        onSetTestImage={setTestImage}
                        audioData={textSandboxAudioData}
                        onSetAudioData={setTextSandboxAudioData}
                        audioFormat={textSandboxAudioFormat}
                        onSetAudioFormat={setTextSandboxAudioFormat}
                        onRunTest={runSandboxTest} 
                        isTesting={isTesting} 
                        testResult={testResult} 
                        testError={testError} 
                        isUrlDefined={!!formData.requestUrl}
                        isTested={formData.isTested}
                        onSetTested={(v) => setFormData({ ...formData, isTested: v })}
                        formData={formData}
                        setFormData={setFormData}
                        features={features}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-[#0c0c0c] border border-slate-800 w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10">
                <ModalHeader 
                    isNew={isNew} 
                    engineId={formData.id} 
                    onClose={onClose} 
                />

                <ModalTabs 
                    activeTab={activeTab} 
                    setActiveTab={setActiveTab} 
                    isProgrammable={formData.isProgrammable}
                    category={formData.category}
                />

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#080808]">
                    {error && (
                        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-xs animate-in shake">
                            {error}
                        </div>
                    )}
                    
                    {renderActiveTab()}
                </div>

                <ModalFooter 
                    isSaving={isSaving}
                    showSuccess={showSuccess}
                    disableCommit={!formData.id}
                    onClose={onClose}
                    onSave={handleSave}
                />
            </div>
        </div>
    );
};
