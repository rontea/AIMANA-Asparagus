import packageJson from '../package.json';
import {
    DEFAULT_GOOGLE_IMAGE_MODEL,
    DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL,
    DEFAULT_GOOGLE_LITE_TEXT_MODEL,
    DEFAULT_GOOGLE_TEXT_MODEL,
    DEFAULT_GOOGLE_TTS_MODEL
} from './googleModelIds';

export interface AppStackItem {
    label: string;
    value: string;
}

const resolvedVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.15.0-dev';

export const APP_METADATA = {
    name: 'AIMANA',
    version: resolvedVersion,
    versionLabel: `v${resolvedVersion}`,
    summary:
        'AIMANA is a local-first AI asset workspace for organizing projects, revisions, and generated media in one secure environment. It keeps your files under your control while connecting prompts, outputs, notes, and automation into a single production workflow.',
    highlights: [
        'Local-First Workspace',
        'Revisioned Assets',
        'Multimodal Studio',
        'Hybrid Cloud Sync'
    ],
    currentStack: [
        { label: 'Primary Text', value: DEFAULT_GOOGLE_TEXT_MODEL },
        { label: 'Fast Text', value: DEFAULT_GOOGLE_LITE_TEXT_MODEL },
        { label: 'Image Gen', value: DEFAULT_GOOGLE_IMAGE_MODEL },
        { label: 'Image Preview', value: DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL },
        { label: 'Speech', value: DEFAULT_GOOGLE_TTS_MODEL },
        { label: 'Chat Registry', value: 'OpenAI GPT-5 Mini via Pollinations' }
    ] satisfies AppStackItem[]
};
