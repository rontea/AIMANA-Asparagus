/**
 * Pollinations.AI Neural Aggregator
 * Modular seeder entry point with modality-based sub-registries.
 */

// Image Cluster
import { fluxPrecision } from './pollinations/img/flux.js';
import { zImageTurbo } from './pollinations/img/zimage.js';
import { gptImage } from './pollinations/img/gpt-image.js';
import { gptImageLarge } from './pollinations/img/gpt-image-large.js';
import { fluxKontext } from './pollinations/img/kontext.js';
import { nanobanana } from './pollinations/img/nanobanana.js';
import { nanobanana2 } from './pollinations/img/nanobanana-2.js';
import { seedream5 } from './pollinations/img/seedream-pro.js';
import { seedream } from './pollinations/img/seedream.js';
import { seedream45Pro } from './pollinations/img/seedream-4-5-pro.js';
import { nanobananaPro } from './pollinations/img/nanobanana-pro.js';
import { kleinPrecision } from './pollinations/img/klein.js';
import { grokImagine } from './pollinations/img/grok-imagine.js';
import { grokImaginePro } from './pollinations/img/grok-imagine-pro.js';
import { pImage } from './pollinations/img/p-image.js';
import { pImageEdit } from './pollinations/img/p-image-edit.js';
import { qwenImage } from './pollinations/img/qwen-image.js';
import { novaCanvas } from './pollinations/img/nova-canvas.js';

// Video Cluster
import { veoVideo } from './pollinations/video/veo.js';
import { seedance } from './pollinations/video/seedance.js';
import { wanVideo } from './pollinations/video/wan.js';
import { grokVideo } from './pollinations/video/grok.js';
import { seedancePro } from './pollinations/video/seedance-pro.js';
import { ltx2Video } from './pollinations/video/ltx-2.js';

// Text Cluster
import { openaiChat } from './pollinations/text/openai.js';

export const pollinationsBlueprints = [
    // Visual
    fluxPrecision,
    pImage,
    pImageEdit,
    kleinPrecision,
    zImageTurbo,
    gptImage,
    gptImageLarge,
    fluxKontext,
    nanobanana,
    nanobanana2,
    seedream5,
    seedream,
    seedream45Pro,
    nanobananaPro,
    grokImagine,
    grokImaginePro,
    qwenImage,
    novaCanvas,
    
    // Motion
    veoVideo,
    seedance,
    wanVideo,
    grokVideo,
    seedancePro,
    ltx2Video,

    // Language
    openaiChat
];
