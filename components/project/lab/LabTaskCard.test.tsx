import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LabTaskCard } from './LabTaskCard';
import { LabTask } from '../../../hooks/useAiGeneration';

const buildTask = (): LabTask => ({
    id: 'task-1',
    title: 'Meeting Transcript',
    prompt: 'Speaker 1: Hello there.',
    modelId: 'whisper-1',
    modelLabel: 'Whisper 1',
    status: 'success',
    progress: 100,
    result: {
        text: 'Speaker 1: Hello there.',
        mimeType: 'text/plain'
    } as any,
    error: null,
    timestamp: Date.now(),
    aspectRatio: '1:1',
    metadata: {
        isTranscription: true,
        transcriptionPostProcess: {
            status: 'pending'
        }
    }
});

describe('LabTaskCard', () => {
    it('keeps transcript cards clickable while post-processing is pending when transcript payload already exists', async () => {
        const user = userEvent.setup();
        const onInspect = vi.fn();

        render(
            <LabTaskCard
                task={buildTask()}
                onRemove={() => {}}
                onSave={() => {}}
                onInspect={onInspect}
                registry={[]}
            />
        );

        await user.click(screen.getByRole('button', { name: /meeting transcript/i }));
        expect(onInspect).toHaveBeenCalledTimes(1);
    });
});
