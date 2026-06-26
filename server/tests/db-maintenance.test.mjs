import test from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRITY_CLEANUP_STEPS } from '../db/maintenance.js';

test('db maintenance defines cleanup coverage for core orphan-prone relations', () => {
    const keys = new Set(INTEGRITY_CLEANUP_STEPS.map((step) => step.key));

    assert.ok(keys.has('project_members_missing_project'));
    assert.ok(keys.has('revisions_missing_item'));
    assert.ok(keys.has('items_missing_project'));
    assert.ok(keys.has('item_references_missing_source'));
    assert.ok(keys.has('item_references_missing_target'));
    assert.ok(keys.has('reference_assets_missing_item'));
    assert.ok(keys.has('items_missing_current_revision'));
});

test('db maintenance cleanup steps only use delete/update normalization statements', () => {
    for (const step of INTEGRITY_CLEANUP_STEPS) {
        assert.match(step.sql.trim(), /^(DELETE|UPDATE)\s+/i);
        assert.ok(step.table);
        assert.ok(step.key);
        assert.ok(step.mode === 'delete' || step.mode === 'update');
    }
});
