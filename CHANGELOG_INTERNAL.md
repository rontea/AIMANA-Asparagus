# Internal Development Changelog

## [Unreleased]

### Features and Functionality

- **Provider Registry Multi-Lane Renewal**: Added `renewProviderLanes` in `components/hub/IntelligenceHubContent.tsx` to execute sequential synchronization across all supported provider registries (`api.settings.syncGoogleModels()`, `/api/settings/registry/sync/pollinations-image`, `/api/settings/registry/sync/pollinations-text`, `/api/settings/registry/sync/pollinations-audio`, `/api/settings/registry/sync/pollinations-video`), report per-lane counts, and dispatch `aimana-registry-updated`.
- **Dynamic Model Catalog Reconciliation**: Implemented automated deletion of stale system models in Pollinations text, image, video, and audio registries (`DELETE FROM custom_engines WHERE provider = 'pollinations' AND category = ... AND isSystem = 1 AND id NOT IN (...)`) so removed upstream models do not persist as phantom engines.

### Code and Architecture

- **`components/hub/IntelligenceHubContent.tsx`**: Added state hooks (`isRenewingProviderLanes`, `providerRenewalSummary`, `renewalError`), aggregated renewal banner messaging, and a primary action trigger card. Synchronized disabled states across individual sync cards while multi-lane renewal is running.
- **`server/db/seed.js`**: Updated `seedCustomEngines()` to query existing `custom_engines` for official Pollinations models (`configJson LIKE '%source=official%'`) and filter out hardcoded default seed blueprints for categories that already possess live synced official models.
- **`server/routes/settings.js`**:
  - Added query parameter `?source=official` to `textSource`, `imageSource`, and `videoSource` metadata stored in `configJson`.
  - Added title fallback (`remote?.title || override.label || description`) across text, image, and video sync handlers.
  - Updated video catalog sync to query upstream `POLLINATIONS_VIDEO_MODELS_URL` instead of media models URL.
  - Added scoped pruning queries during sync to delete deprecated system engines not present in the latest provider catalog.
- **`components/AssetCard.tsx`**: Changed thumbnail image class from `object-cover` to `object-contain` to maintain complete aspect-ratio visibility without cropping previews.
- **`internal.docs/checkpoint-hub.md`**: Updated documentation detailing the sequential multi-lane renewal behavior and stale engine cleanup mechanics.
- **`internal.todo/`**: Added comprehensive architecture specifications for release pipelines (`plan_cicd.md`) and manual update systems (`todo-owner-application-update-system-2026-07-21.md`).

### Bug Fixes

- **Seed Blueprint Overwrites**: Fixed server startup / re-seeding overwriting dynamic Pollinations engine catalogs with static fallback blueprints.
- **Phantom System Engines**: Fixed removed or renamed upstream Pollinations models lingering permanently in `custom_engines` as orphaned system engines.
- **Video Catalog Upstream Endpoint**: Corrected video sync handler fetching from `POLLINATIONS_MEDIA_MODELS_URL` rather than the dedicated `POLLINATIONS_VIDEO_MODELS_URL`.

### Tests and Validation

- Executed server automated test suite via Node test runner (`node --test server/tests/**/*.test.mjs`): 109 tests passed, 0 failures, 0 skipped.
- Verified schema safety: stale model pruning explicitly targets `isSystem = 1` and excludes user-forged or custom engines (`isSystem = 0`).
- Validated TypeScript typing and build consistency on `IntelligenceHubContent.tsx` and related components.

### Known Issues and Limitations

- Provider lane renewal requires network connectivity to upstream Google and Pollinations APIs; individual failed lanes surface in summary banner without blocking succeeding lanes.

### Files Changed

- `components/hub/IntelligenceHubContent.tsx` — Added "Renew All Lanes" UI callout card, state management, and sequential sync execution.
- `internal.docs/checkpoint-hub.md` — Updated operational documentation for multi-lane registry renewal.
- `server/db/seed.js` — Guarded default Pollinations blueprints against overwriting official live models.
- `server/routes/settings.js` — Enhanced Pollinations sync handlers with source tracking, title fallback, correct endpoint routing, and stale engine pruning.
- `components/AssetCard.tsx` — Switched image display to `object-contain`.
- `README.md` — Added link to public `CHANGELOG.md`.
- `internal.todo/plan_cicd.md` — CI/CD architecture plan.
- `internal.todo/todo-owner-application-update-system-2026-07-21.md` — Owner update system plan.

### Notes

- User-forged custom models are preserved during registry reconciliation because queries explicitly condition on `isSystem = 1`.

