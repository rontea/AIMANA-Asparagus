import React, { useCallback, useState } from 'react';
import { AlertDialog, AlertDialogTone } from '../components/common/AlertDialog';
import { ConfirmDialog, ConfirmDialogTone } from '../components/common/ConfirmDialog';

export interface ConfirmConfig {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmDialogTone;
}

export interface ChoiceConfig {
    title: string;
    description: string;
    confirmLabel: string;
    secondaryLabel: string;
    cancelLabel?: string;
    tone?: ConfirmDialogTone;
    secondaryTone?: ConfirmDialogTone;
}

export type ChoiceResult = 'confirm' | 'secondary' | 'cancel';

export interface AlertConfig {
    title: string;
    description: string;
    actionLabel?: string;
    tone?: AlertDialogTone;
}

interface ConfirmState extends ConfirmConfig {
    resolve: (value: boolean) => void;
}

interface ChoiceState extends ChoiceConfig {
    resolve: (value: ChoiceResult) => void;
}

interface AlertState extends AlertConfig {
    resolve: () => void;
}

export const useModalDialogs = () => {
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
    const [choiceState, setChoiceState] = useState<ChoiceState | null>(null);
    const [alertState, setAlertState] = useState<AlertState | null>(null);

    const confirm = useCallback((config: ConfirmConfig) => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({ ...config, resolve });
        });
    }, []);

    const alert = useCallback((config: AlertConfig) => {
        return new Promise<void>((resolve) => {
            setAlertState({ ...config, resolve });
        });
    }, []);

    const choose = useCallback((config: ChoiceConfig) => {
        return new Promise<ChoiceResult>((resolve) => {
            setChoiceState({ ...config, resolve });
        });
    }, []);

    const confirmDialog = confirmState
        ? React.createElement(ConfirmDialog, {
            isOpen: true,
            title: confirmState.title,
            description: confirmState.description,
            confirmLabel: confirmState.confirmLabel,
            cancelLabel: confirmState.cancelLabel,
            tone: confirmState.tone,
            onCancel: () => {
                confirmState.resolve(false);
                setConfirmState(null);
            },
            onConfirm: () => {
                confirmState.resolve(true);
                setConfirmState(null);
            }
        })
        : null;

    const choiceDialog = choiceState
        ? React.createElement(ConfirmDialog, {
            isOpen: true,
            title: choiceState.title,
            description: choiceState.description,
            confirmLabel: choiceState.confirmLabel,
            secondaryLabel: choiceState.secondaryLabel,
            cancelLabel: choiceState.cancelLabel,
            tone: choiceState.tone,
            secondaryTone: choiceState.secondaryTone,
            onCancel: () => {
                choiceState.resolve('cancel');
                setChoiceState(null);
            },
            onSecondary: () => {
                choiceState.resolve('secondary');
                setChoiceState(null);
            },
            onConfirm: () => {
                choiceState.resolve('confirm');
                setChoiceState(null);
            }
        })
        : null;

    const alertDialog = alertState
        ? React.createElement(AlertDialog, {
            isOpen: true,
            title: alertState.title,
            description: alertState.description,
            actionLabel: alertState.actionLabel,
            tone: alertState.tone,
            onClose: () => {
                alertState.resolve();
                setAlertState(null);
            }
        })
        : null;

    return {
        confirm,
        choose,
        alert,
        confirmDialog,
        choiceDialog,
        alertDialog
    };
};
