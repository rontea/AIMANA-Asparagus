import React, { useState } from 'react';
import { Edit2, AlertTriangle } from 'lucide-react';

interface PinSetupFormProps {
    isEditMode: boolean;
    onSave: (pin: string) => Promise<void>;
    onCancel: () => void;
}

export const PinSetupForm: React.FC<PinSetupFormProps> = ({ isEditMode, onSave, onCancel }) => {
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (newPin.length !== 6 || confirmPin.length !== 6) {
            setError("PIN must be exactly 6 digits.");
            return;
        }
        if (newPin !== confirmPin) {
            setError("PINs do not match.");
            return;
        }
        
        setIsSaving(true);
        setError(null);
        try {
            await onSave(newPin);
        } catch (e) {
            setError("Failed to save PIN. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-indigo-500/30 space-y-4 shadow-inner animate-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 size={14} className="text-indigo-400" />
                {isEditMode ? 'Update 6-Digit PIN' : 'Initialize 6-Digit PIN'}
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 ml-1">New PIN</label>
                    <input 
                        type="password" 
                        maxLength={6} 
                        value={newPin} 
                        onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} 
                        placeholder="••••••" 
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono tracking-[1em] text-center outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 ml-1">Confirm PIN</label>
                    <input 
                        type="password" 
                        maxLength={6} 
                        value={confirmPin} 
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g,''))} 
                        placeholder="••••••" 
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono tracking-[1em] text-center outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            {error && (
                <p className="text-red-400 text-xs font-medium flex items-center gap-1.5 px-1 animate-in shake">
                    <AlertTriangle size={12}/> {error}
                </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
                <button 
                    onClick={onCancel}
                    disabled={isSaving}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSave} 
                    disabled={isSaving || newPin.length < 6}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save PIN'}
                </button>
            </div>
        </div>
    );
};