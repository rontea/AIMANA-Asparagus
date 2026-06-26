import React from 'react';
import { LucideIcon, LockKeyhole } from 'lucide-react';

interface ProtectionToggleProps {
    icon: LucideIcon;
    iconColor: string;
    title: string;
    description: string;
    isEnabled: boolean;
    isDisabled?: boolean;
    onToggle: () => void;
    lockIcon?: boolean;
    lockColor?: string;
    activeLabel?: string;
    inactiveLabel?: string;
    extraAction?: React.ReactNode;
}

export const ProtectionToggle: React.FC<ProtectionToggleProps> = ({
    icon: Icon, iconColor, title, description, isEnabled, isDisabled, onToggle, 
    lockIcon, lockColor, activeLabel = "Enabled", inactiveLabel = "Disabled", extraAction
}) => (
    <div className={`flex flex-col md:flex-row md:items-center justify-between gap-6 transition-opacity ${isDisabled ? 'opacity-50' : 'opacity-100'}`}>
        <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
                <Icon size={18} className={iconColor} />
                <h3 className="font-medium text-slate-200">{title}</h3>
                {lockIcon && <span title="Protected feature"><LockKeyhole size={14} className={lockColor} /></span>}
            </div>
            <p className="text-sm text-slate-400 max-w-lg">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex items-center gap-3">
                {extraAction}
                <button 
                    onClick={onToggle} 
                    disabled={isDisabled}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isEnabled ? 'bg-indigo-600' : 'bg-slate-600'} ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className={`text-sm font-medium min-w-[60px] ${isEnabled ? 'text-indigo-400' : 'text-slate-500'}`}>
                    {isEnabled ? activeLabel : inactiveLabel}
                </span>
            </div>
        </div>
    </div>
);