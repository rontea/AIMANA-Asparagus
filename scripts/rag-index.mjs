#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const VALID_SOURCES = new Set(['project-items', 'projects', 'prompts', 'manifests']);

const printUsage = () => {
    console.log([
        'Usage: npm run rag:index -- [options]',
        '',
        'Options:',
        '  --source <name>       Index one source type. Can be repeated or comma-separated.',
        '                        Valid: project-items, projects, prompts, manifests',
        '  --batch-size <number> Embedding batch size. Default comes from the index service.',
        '  --status             Print current index status without re-indexing.',
        '  --help               Show this help text.',
        '',
        'Examples:',
        '  npm run rag:index',
        '  npm run rag:index -- --source prompts',
        '  npm run rag:index -- --source project-items --source manifests'
    ].join('\n'));
};

const parseArgs = (argv) => {
    const options = {
        sources: [],
        batchSize: undefined,
        statusOnly: false,
        help: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        if (arg === '--status') {
            options.statusOnly = true;
            continue;
        }
        if (arg === '--source' || arg === '-s') {
            const value = argv[i + 1];
            if (!value || value.startsWith('-')) {
                throw new Error('--source requires a source name.');
            }
            options.sources.push(...value.split(',').map((part) => part.trim()).filter(Boolean));
            i += 1;
            continue;
        }
        if (arg.startsWith('--source=')) {
            const value = arg.slice('--source='.length);
            options.sources.push(...value.split(',').map((part) => part.trim()).filter(Boolean));
            continue;
        }
        if (arg === '--batch-size') {
            const value = argv[i + 1];
            if (!value || value.startsWith('-')) {
                throw new Error('--batch-size requires a number.');
            }
            options.batchSize = Number(value);
            i += 1;
            continue;
        }
        if (arg.startsWith('--batch-size=')) {
            options.batchSize = Number(arg.slice('--batch-size='.length));
            continue;
        }
        throw new Error(`Unknown option: ${arg}`);
    }

    options.sources = Array.from(new Set(options.sources));
    const invalid = options.sources.filter((source) => !VALID_SOURCES.has(source));
    if (invalid.length > 0) {
        throw new Error(`Invalid source type: ${invalid.join(', ')}. Valid sources: ${Array.from(VALID_SOURCES).join(', ')}`);
    }
    if (options.batchSize !== undefined && (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 32)) {
        throw new Error('--batch-size must be an integer from 1 to 32.');
    }

    return options;
};

const formatStatus = (status) => ({
    totalChunks: status.totalChunks,
    totalSources: status.totalSources,
    lastIndexedAt: status.lastIndexedAt,
    lastIndexedAtIso: status.lastIndexedAt ? new Date(status.lastIndexedAt).toISOString() : null,
    byType: status.byType
});

const main = async () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    const [{ initDB }, { indexRagSources, getRagIndexStatus }] = await Promise.all([
        import('../server/db.js'),
        import('../server/services/ragIndexService.js')
    ]);

    await initDB();

    if (options.statusOnly) {
        console.log(JSON.stringify(formatStatus(await getRagIndexStatus()), null, 2));
        return;
    }

    const sources = options.sources.length > 0 ? options.sources : undefined;
    console.log(`[rag:index] Starting index${sources ? ` for ${sources.join(', ')}` : ' for all sources'}...`);
    const summary = await indexRagSources({
        sources,
        batchSize: options.batchSize
    });
    const status = await getRagIndexStatus();

    console.log('[rag:index] Index complete.');
    console.log(JSON.stringify({
        summary,
        status: formatStatus(status)
    }, null, 2));
};

main().catch((error) => {
    console.error(`[rag:index] ${error.message}`);
    process.exit(1);
});
