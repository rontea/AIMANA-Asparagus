import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const IMPORT_PATTERN = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const FORBIDDEN_RUNTIME_PATTERN = /\b(?:eval\s*\(|new Function\s*\()/;
const packageSourceRoots = [join(packageRoot, 'src'), join(packageRoot, 'server')];

const collectSourceFiles = (directoryPath: string): string[] =>
    readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            return collectSourceFiles(entryPath);
        }

        return ['.ts', '.tsx', '.js', '.mjs'].includes(extname(entry.name)) ? [entryPath] : [];
    });

describe('example extension package boundaries', () => {
    it('does not reach into host app internals or use dynamic code execution primitives', () => {
        const sourceFiles = packageSourceRoots.flatMap((sourceRoot) => collectSourceFiles(sourceRoot));
        const boundaryViolations: string[] = [];

        sourceFiles.forEach((filePath) => {
            const fileContents = readFileSync(filePath, 'utf8');
            let match;

            while ((match = IMPORT_PATTERN.exec(fileContents)) !== null) {
                const specifier = match[1] ?? '';

                if (specifier.startsWith('@/')) {
                    boundaryViolations.push(`${relative(packageRoot, filePath)} -> ${specifier}`);
                    continue;
                }

                if (specifier.startsWith('.')) {
                    const resolvedPath = resolve(dirname(filePath), specifier);
                    const relativeToPackage = relative(packageRoot, resolvedPath);

                    if (relativeToPackage.startsWith('..')) {
                        boundaryViolations.push(`${relative(packageRoot, filePath)} -> ${specifier}`);
                    }
                }
            }

            if (FORBIDDEN_RUNTIME_PATTERN.test(fileContents)) {
                boundaryViolations.push(`${relative(packageRoot, filePath)} -> dynamic-code-execution`);
            }
        });

        expect(boundaryViolations).toEqual([]);
    });
});
