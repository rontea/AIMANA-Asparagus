import { describe, expect, it } from 'vitest';
import { parseSseEvents, parseSseTrailingEvents } from './streaming';

describe('streaming parser', () => {
    it('parses complete SSE blocks and keeps remainder', () => {
        const input = [
            'data: {"delta":"Hel"}',
            '',
            'data: {"delta":"lo","requestId":"req-1"}',
            '',
            'data: {"delta":" world"}'
        ].join('\n');

        const parsed = parseSseEvents(input);
        expect(parsed.events).toEqual([
            { delta: 'Hel' },
            { delta: 'lo', requestId: 'req-1' }
        ]);
        expect(parsed.remainder).toBe('data: {"delta":" world"}');
    });

    it('ignores malformed JSON and handles DONE markers', () => {
        const input = [
            'data: not-json',
            '',
            'data: [DONE]',
            '',
            'data: {"latencyMs":123}'
        ].join('\n');

        const parsed = parseSseEvents(input);
        expect(parsed.events).toEqual([{ done: true }]);
        expect(parsed.remainder).toBe('data: {"latencyMs":123}');
        expect(parseSseTrailingEvents(parsed.remainder)).toEqual([{ latencyMs: 123 }]);
    });

    it('parses trailing buffer chunk without delimiter', () => {
        const trailing = 'data: {"delta":"tail","latencyMs":45}';
        expect(parseSseTrailingEvents(trailing)).toEqual([
            { delta: 'tail', latencyMs: 45 }
        ]);
    });

    it('supports CRLF event streams', () => {
        const input = 'data: {"delta":"A"}\r\n\r\ndata: {"delta":"B"}\r\n\r\n';
        const parsed = parseSseEvents(input);
        expect(parsed.events).toEqual([{ delta: 'A' }, { delta: 'B' }]);
        expect(parsed.remainder).toBe('');
    });

    it('parses done packets with content metadata', () => {
        const input = [
            'data: {"done":true,"content":"Final reply","requestId":"req-final","latencyMs":321}',
            '',
            ''
        ].join('\n');
        const parsed = parseSseEvents(input);
        expect(parsed.events).toEqual([
            { done: true, content: 'Final reply', requestId: 'req-final', latencyMs: 321 }
        ]);
        expect(parsed.remainder).toBe('');
    });

    it('preserves workspace source route metadata from diagnostics', () => {
        const input = [
            'data: {"done":true,"diagnostics":{"sources":[{"title":"Matrix 4x2","sourceRoute":"/project/project-2?itemId=item-2","sourceType":"project-items","sourceId":"item-2","snippet":"Exact source."}]}}',
            '',
            ''
        ].join('\n');
        const parsed = parseSseEvents(input);
        expect(parsed.events[0]?.diagnostics?.sources).toEqual([
            {
                title: 'Matrix 4x2',
                sourceRoute: '/project/project-2?itemId=item-2',
                sourceType: 'project-items',
                sourceId: 'item-2',
                snippet: 'Exact source.'
            }
        ]);
    });
});
