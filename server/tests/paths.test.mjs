import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getPhysicalPathFromUrl } from '../utils/paths.js';
import { UPLOADS_DIR } from '../db.js';

test('paths: resolves uploads URLs to disk path within uploads dir', () => {
    const out = getPhysicalPathFromUrl('/storage/uploads/project-a/image.png');
    assert.ok(out);
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    assert.ok(out.startsWith(uploadsRoot + path.sep));
});

test('paths: blocks path traversal outside uploads dir', () => {
    const out = getPhysicalPathFromUrl('/storage/uploads/../secrets.txt');
    assert.equal(out, null);
});

test('paths: returns null when uploads marker is missing', () => {
    const out = getPhysicalPathFromUrl('/storage/other/path.png');
    assert.equal(out, null);
});
