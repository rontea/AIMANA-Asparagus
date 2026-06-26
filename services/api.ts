import { settings } from './api/settings';
import { auth } from './api/auth';
import { app } from './api/app';
import { drive } from './api/drive';
import { admin, users } from './api/admin';
import { projects, items, collections, revisions } from './api/assets';
import { chatItems } from './api/chatItems';
import { chatSessions } from './api/chatSessions';
import { chatMemory } from './api/chatMemory';
import { errors } from './api/errors';
import { promptAssistant } from './api/promptAssistant';

/**
 * AIMANA Modular API Client
 * Provides centralized network logic separated by domain.
 * Refactored for scalability and ease of debugging.
 */
export const api = {
    app,
    settings,
    auth,
    drive,
    users,
    admin,
    errors,
    projects,
    items,
    collections,
    revisions,
    chatItems,
    chatSessions,
    chatMemory,
    promptAssistant
};
