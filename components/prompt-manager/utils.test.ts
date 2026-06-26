import { describe, expect, it } from 'vitest';
import {
  autoCorrectPromptImportJsonInput,
  buildPromptThumbnailBlurAiParameters,
  checkPromptImportJsonInput,
  derivePromptTitle,
  filterPromptDrafts,
  getPromptDraftDuplicateGroups,
  getPromptThumbnailBlurClass,
  isPromptThumbnailBlurEnabled,
  getPromptExportPayload,
  parsePromptImportInput,
  resolvePromptImportVariables,
  toPromptDraft
} from './utils';

describe('prompt manager utils', () => {
  it('parses prompt import json records', () => {
    const result = parsePromptImportInput(JSON.stringify([
      { title: 'Hero', prompt: 'Cinematic portrait', label: 'campaign' },
      { prompt: 'Neon skyline at dusk' }
    ]));

    expect(result).toEqual([
      { title: 'Hero', prompt: 'Cinematic portrait', raw: undefined, label: 'campaign', tags: undefined, note: undefined, source: 'json' },
      { title: undefined, prompt: 'Neon skyline at dusk', raw: undefined, label: undefined, tags: undefined, note: undefined, source: 'json' }
    ]);
  });

  it('checks valid prompt import json records', () => {
    const result = checkPromptImportJsonInput(JSON.stringify([
      { title: 'Hero', prompt: 'Cinematic portrait' },
      'Neon skyline at dusk'
    ]));

    expect(result).toEqual({
      ok: true,
      count: 2,
      message: '2 prompt drafts ready to import.'
    });
  });

  it('reports invalid prompt import json without plain text fallback', () => {
    const syntaxResult = checkPromptImportJsonInput('[{"title":"Hero","prompt":]');
    expect(syntaxResult.ok).toBe(false);
    expect(syntaxResult.message).toContain('JSON');

    const structureResult = checkPromptImportJsonInput(JSON.stringify([{ title: 'Missing Prompt' }]));
    expect(structureResult).toEqual({
      ok: false,
      count: 0,
      message: 'Entry 1 is missing a prompt.'
    });
  });

  it('auto-corrects common prompt import json formatting issues', () => {
    const result = autoCorrectPromptImportJsonInput("```json\n{ title: 'Hero', prompt: 'Cinematic portrait', }\n```");

    expect(result.changed).toBe(true);
    expect(result.check).toEqual({
      ok: true,
      count: 1,
      message: '1 prompt draft ready to import.'
    });
    expect(parsePromptImportInput(result.corrected)).toEqual([
      {
        title: 'Hero',
        prompt: 'Cinematic portrait',
        raw: undefined,
        label: undefined,
        tags: undefined,
        note: undefined,
        source: 'json'
      }
    ]);
  });

  it('auto-corrects smart quotes and trailing commas in arrays', () => {
    const result = autoCorrectPromptImportJsonInput('[{ “title”: “Hero”, “prompt”: “Cinematic portrait”, },]');

    expect(result.changed).toBe(true);
    expect(result.check.ok).toBe(true);
    expect(result.check.count).toBe(1);
  });

  it('resolves prompt thumbnail blur from drafts and revision metadata', () => {
    expect(isPromptThumbnailBlurEnabled({ thumbnailBlur: true })).toBe(true);
    expect(getPromptThumbnailBlurClass({ thumbnailBlur: true })).toBe('blur-md');

    const aiParameters = buildPromptThumbnailBlurAiParameters(
      JSON.stringify({ advanced_params: { promptSource: 'manual' } }),
      true
    );
    expect(isPromptThumbnailBlurEnabled({ currentRevision: { aiParameters } })).toBe(true);
    expect(JSON.parse(aiParameters).advanced_params.thumbnailBlur).toBe(true);
  });

  it('falls back to newline prompt parsing for plain text input', () => {
    const result = parsePromptImportInput('first prompt\n\nsecond prompt');
    expect(result).toEqual([
      { prompt: 'first prompt' },
      { prompt: 'second prompt' }
    ]);
  });

  it('parses titled plain text manifest lines', () => {
    const result = parsePromptImportInput('Hero Shot | Cinematic portrait\nNeon Street :: Rainy cyberpunk skyline');
    expect(result).toEqual([
      { title: 'Hero Shot', prompt: 'Cinematic portrait' },
      { title: 'Neon Street', prompt: 'Rainy cyberpunk skyline' }
    ]);
  });

  it('creates draft metadata with derived titles', () => {
    const draft = toPromptDraft(
      { prompt: 'A long cinematic establishing shot of a floating city above the sea' },
      () => 'draft-1',
      42
    );

    expect(draft).toMatchObject({
      id: 'draft-1',
      title: 'A long cinematic establishing shot of a floatin...',
      prompt: 'A long cinematic establishing shot of a floating city above the sea',
      status: 'staging',
      createdAt: 42,
      updatedAt: 42
    });
  });

  it('filters drafts by title, prompt, label, or tags', () => {
    const drafts = [
      {
        id: '1',
        title: 'Cyberpunk City',
        prompt: 'Neon rain and flying cars',
        label: 'visual',
        status: 'staging' as const,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: '2',
        title: 'Forest',
        prompt: 'Misty path',
        label: 'nature',
        tags: 'moodboard, pine',
        status: 'ready' as const,
        createdAt: 2,
        updatedAt: 2
      }
    ];

    expect(filterPromptDrafts(drafts, 'visual')).toHaveLength(1);
    expect(filterPromptDrafts(drafts, 'misty')).toHaveLength(1);
    expect(filterPromptDrafts(drafts, 'cyber')).toHaveLength(1);
    expect(filterPromptDrafts(drafts, 'pine')).toHaveLength(1);
  });

  it('groups exact prompt duplicates by normalized title and prompt text', () => {
    const groups = getPromptDraftDuplicateGroups([
      {
        id: '1',
        title: 'Hero Shot',
        prompt: 'Cinematic portrait  with rim light',
        status: 'staging',
        createdAt: 1,
        updatedAt: 2
      },
      {
        id: '2',
        title: '  hero shot  ',
        prompt: 'Cinematic portrait with rim light',
        status: 'ready',
        createdAt: 3,
        updatedAt: 4
      },
      {
        id: '3',
        title: 'Different',
        prompt: 'Other prompt',
        status: 'staging',
        createdAt: 5,
        updatedAt: 6
      }
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('builds export payloads without blank metadata', () => {
    const payload = getPromptExportPayload([
      {
        id: '1',
        title: 'Prompt A',
        prompt: 'Hello world',
        label: ' launch ',
        tags: 'hero, launch, hero',
        note: ' keep ',
        status: 'ready',
        createdAt: 1,
        updatedAt: 1
      }
    ]);

    expect(payload).toEqual([
      {
        title: 'Prompt A',
        prompt: 'Hello world',
        raw: undefined,
        label: 'launch',
        tags: 'hero, launch',
        note: 'keep',
        source: 'manual',
        previewImageUrl: undefined,
        previewMimeType: undefined
      }
    ]);
  });

  it('derives export titles when drafts have blank titles', () => {
    const payload = getPromptExportPayload([
      {
        id: '1',
        title: '   ',
        prompt: 'Neon skyline at dusk with rain',
        status: 'ready',
        createdAt: 1,
        updatedAt: 1
      }
    ]);

    expect(payload[0]?.title).toBe('Neon skyline at dusk with rain');
  });

  it('normalizes invalid draft sources during export', () => {
    const payload = getPromptExportPayload([
      {
        id: '1',
        title: 'Prompt A',
        prompt: 'Hello world',
        source: 'imported' as any,
        status: 'ready',
        createdAt: 1,
        updatedAt: 1
      }
    ]);

    expect(payload[0]?.source).toBe('manual');
  });

  it('derives safe fallback titles', () => {
    expect(derivePromptTitle('')).toBe('Untitled Prompt');
    expect(derivePromptTitle('Line 1\nLine 2')).toBe('Line 1');
  });

  it('resolves variable placeholders with flexible key separators', () => {
    const raw = '{"prompt":"Hello {{ first name }} / {{ first-name }} / {{ first_name }}"}';
    const resolved = resolvePromptImportVariables(raw, [
      { key: 'first_name', value: 'Aimana' }
    ]);
    expect(resolved).toContain('Hello Aimana / Aimana / Aimana');
  });

  it('replaces placeholder with blank when variable value is blank', () => {
    const raw = '{"prompt":"Hello {{ name }}"}';
    const resolved = resolvePromptImportVariables(raw, [
      { key: 'name', value: '' }
    ]);
    expect(resolved).toContain('Hello ');
    expect(resolved).not.toContain('{{ name }}');
  });
});
