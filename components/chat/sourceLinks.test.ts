import { describe, expect, it } from 'vitest';
import {
    getWorkspaceRouteFromSourceUrl,
    isWorkspaceSourceUrl,
    rewriteWorkspaceSourceUrl
} from './sourceLinks';

describe('sourceLinks', () => {
    it('rewrites workspace routes for the hash router', () => {
        expect(rewriteWorkspaceSourceUrl('/project/project-1?itemId=item-1'))
            .toBe('http://localhost:3000/#/project/project-1?itemId=item-1');
        expect(rewriteWorkspaceSourceUrl('/prompt-manager'))
            .toBe('http://localhost:3000/#/prompt-manager');
    });

    it('keeps existing hash workspace URLs canonical', () => {
        expect(rewriteWorkspaceSourceUrl('http://localhost:3000/#/project/project-2?itemId=item-2'))
            .toBe('http://localhost:3000/#/project/project-2?itemId=item-2');
        expect(getWorkspaceRouteFromSourceUrl('/#/prompt-manager?tab=ready'))
            .toBe('/prompt-manager?tab=ready');
    });

    it('does not rewrite external URLs', () => {
        expect(rewriteWorkspaceSourceUrl('https://example.com/project/project-1'))
            .toBe('https://example.com/project/project-1');
        expect(isWorkspaceSourceUrl('https://example.com/project/project-1')).toBe(false);
    });
});
