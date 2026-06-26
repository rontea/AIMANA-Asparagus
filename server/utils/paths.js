
import path from 'path';
import { UPLOADS_DIR } from '../db.js';

/**
 * Normalizes project names for safe filesystem directory creation.
 */
export const sanitizeDirName = (name) => (name || 'untitled').replace(/[^a-zA-Z0-9]/g, '_');

/**
 * Ensures web URLs use forward slashes regardless of OS.
 */
export const normalizeWebSlashes = (url) => (url || '').replace(/\\/g, '/');

/**
 * Resolves a public file URL to its physical location on the server disk.
 */
export const getPhysicalPathFromUrl = (fileUrl) => {
  if (!fileUrl) return null;
  const normalized = normalizeWebSlashes(fileUrl);
  const uploadsMarker = 'uploads/';
  const markerIndex = normalized.lastIndexOf(uploadsMarker);
  if (markerIndex === -1) return null;
  const relativePart = normalized.substring(markerIndex + uploadsMarker.length);
  const osRelativePart = relativePart.split('/').join(path.sep);
  const resolvedUploads = path.resolve(UPLOADS_DIR);
  const resolvedTarget = path.resolve(UPLOADS_DIR, osRelativePart);
  if (resolvedTarget === resolvedUploads) return null;
  if (!resolvedTarget.startsWith(resolvedUploads + path.sep)) return null;
  return resolvedTarget;
};
