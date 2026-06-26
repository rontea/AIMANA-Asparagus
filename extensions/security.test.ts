import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(extensionsDir);

const FRONTEND_EXTENSION_RUNTIME_FILES = [
    join(projectRoot, 'App.tsx'),
    join(projectRoot, 'extensions', 'hostConfig.ts'),
    join(projectRoot, 'extensions', 'loader.ts'),
    join(projectRoot, 'extensions', 'registry.ts')
];

describe('extension security boundaries', () => {
    it('keeps frontend extension registration build-time and free of dynamic code loading', () => {
        const violations: string[] = [];

        FRONTEND_EXTENSION_RUNTIME_FILES.forEach((filePath) => {
            const fileContents = readFileSync(filePath, 'utf8');

            if (/\bimport\s*\(/.test(fileContents)) {
                violations.push(`${filePath}: dynamic import()`);
            }

            if (/\beval\s*\(/.test(fileContents)) {
                violations.push(`${filePath}: eval()`);
            }

            if (/\bnew Function\s*\(/.test(fileContents)) {
                violations.push(`${filePath}: new Function()`);
            }
        });

        expect(violations).toEqual([]);
    });
});
