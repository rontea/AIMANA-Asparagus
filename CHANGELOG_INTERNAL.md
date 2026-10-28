# Internal Development Changelog

Internal architectural notes, engineering specifications, and technical implementation details for **AIMANA Asparagus**.

For user-facing release notes and high-level feature summaries, see [CHANGELOG.md](./CHANGELOG.md).

---

## [0.16.101] - 2026-10-29 (Release Commit: [`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571))

### Features and Functionality

- **Installer Full Baseline Migration**: Implemented end-to-end workspace restoration during the initial setup workflow at `/install` via `POST /api/app/bootstrap/migrate`. Administrators can upload an existing Full Baseline ZIP archive (SQLite database snapshot + uploaded media) up to 1 GB directly into an uninitialized installation.
- **Dynamic Clean-State Verification**: Added `allowBackupMigration` capability gate in `server/utils/installStatus.js`, ensuring migrations are only offered when the destination instance is in a pristine state (no registered users, no admin, no workspace assets, and unfinalized installer state).
- **Interactive Migration UI & Reporting**: Added a dedicated "Migrate from a Full Baseline" section in `pages/Install.tsx` featuring confirmation modals, progress state handling, and a post-migration report card detailing rows touched, uploads extracted, source engine version, and warnings.
- **Concurrency Mutation Lockout**: Integrated a router-level locking mechanism (`installBackupMigrationInProgress`) in `server/routes/app.js` that rejects concurrent mutation requests with `409 Conflict` while a migration is in progress.
- **Sensitive Data Exposure Containment**: Shielded server-side credentials and system details from client discovery by scoping Vite bundle defines, delegating Google AI operations to backend proxy endpoints, protecting static uploads behind authentication, masking installer status diagnostics, and suppressing raw exception output from unhandled error responses.

### Code and Architecture

- **`vite.config.ts`**: Replaced arbitrary `process.env` expansion with an explicit allowlist containing only browser-facing keys (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`), preventing build-time inlining of server secrets into public bundles.
- **`server/routes/proxy.js`**: Added authenticated `POST /api/proxy/google/generate` utilizing the server-side `@google/genai` client and private `API_KEY`.
- **`services/geminiService.ts` & `hooks/useAiGeneration.ts`**: Re-routed Google Gemini generation, image synthesis, audio/speech generation, and asset analysis through the authenticated `/api/proxy/google/generate` proxy route.
- **`index.js`**: Bound `requireAuth` middleware to `/storage/uploads` and `/uploads` static file mounts to block anonymous file enumeration.
- **`server/middleware.js`**: Refactored `globalErrorHandler` to respond with a generic `Internal server error` and opaque `eventId` instead of forwarding `err.message` to clients.
- **`server/utils/installStatus.js` & `server/utils/installerConfig.js`**: Omitted administrator identities and local filesystem paths from public setup status and summary payloads, while fully masking runtime credential values.
- **`server/utils/backupRestore.js`**: Extracted and centralized shared backup/restore primitives previously coupled to `server/routes/admin.js`:
  - `parseBackupBundle` & `parseInstallBackupBundle`: Ingestion of full and incremental ZIP archives using `JSZip` and streaming `yauzl`.
  - `asTableMap`: Strict manifest validation and schema data-structure extraction.
  - `orderTableNames`: Dependency-ordered topological priority table sequencing to maintain foreign-key integrity during inserts.
  - `getTableColumns`: PRAGMA table inspection avoiding column-mismatch insert errors across version boundaries.
  - `resolveSafeUploadTarget`: Path traversal (ZipSlip) defense ensuring extract targets never escape `storage/uploads/`.
  - `applyManifestFull` & `restoreUploadsFromZip`: Batch insertion and binary extraction routines.
  - `restoreFullBackupForInstall`: Specialized installer orchestration that cleanses old sessions (`auth_sessions`) and updates system events.
- **`server/routes/app.js`**:
  - Configured disk-backed `multer` temporary storage (`storage/.install-upload-*`) to stream large archives to disk rather than holding 1 GB in Node heap memory.
  - Added connection abort/finish handlers (`cleanupMigrationUpload`) to guarantee cleanup of temporary upload folders.
- **`server/routes/admin.js`**: Refactored admin `/system/restore` and `/system/backup/create` to consume shared utilities from `backupRestore.js`, removing duplicated table sorting, manifest parsing, and extraction logic.
- **`server/utils/installStatus.js`**: Added SQLite query `SELECT COUNT(*) as count FROM users` to verify empty state and wired `allowBackupMigration` into `InstallStatus.capabilities`.
- **`services/api/app.ts` & `types.ts`**: Declared `InstallBackupMigrationResult` interface and `app.migrateFromFullBackup` API client method.
- **`docs/environment.md`**: Created comprehensive environment variable reference covering runtime, security, provider keys, search modes, and ingestion boundaries.
- **`docs/migration.md`**: Created operational runbook covering installer migration prerequisites, 1 GB size boundaries, zero-downtime offline SQLite cutover, and multi-file incremental restore chains.

### Security and Safety Boundaries

- **Frontend Secret Isolation**: Only explicitly vetted browser keys (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`) are exposed to client code; `API_KEY`, `AUTH_SECRET`, and other server secrets remain strictly on the backend.
- **Upload Endpoint Authentication**: Protected `/storage/uploads` and `/uploads` static file middleware in `index.js` with `requireAuth` to prevent unauthenticated file enumeration.
- **Installer Diagnostics Redaction**: Sanitized installer status responses in `server/utils/installStatus.js` and `server/utils/installerConfig.js` to strip administrator identity and absolute disk paths, and masked runtime configuration secrets.
- **Error Sanitization**: Updated `globalErrorHandler` in `server/middleware.js` to return generic client error messages and avoid leaking raw stack or exception messages.
- **Path Traversal (ZipSlip) Defense**: `resolveSafeUploadTarget` rejects archive entries containing `..` or absolute paths, preventing file overwrites outside the dedicated uploads folder.
- **Memory Denial of Service (DoS) Mitigation**: Replaced JSZip buffer loading in the installer route with disk-backed streaming decompression via `yauzl`, allowing multi-hundred-megabyte uploads without memory spikes.
- **Admin Account Verification**: Uploaded bundles are validated to ensure `users` table contains at least one administrator account (`role === 'admin'` or `id === 'admin-root'`) prior to replacing local database data.
- **Session Purging**: All existing sessions from the source instance are truncated during restoration to enforce re-authentication.

### Tests and Validation

- **Installer Integration Tests**:
  - [`pages/Install.test.tsx`](./pages/Install.test.tsx): Validated full installer flow, admin creation, and summary reporting.
  - [`App.install.test.tsx`](./App.install.test.tsx): Validated route protection and fallback states with `allowBackupMigration` flags.
- **Snapshot Tests**:
  - [`tests/installStatus.snapshot.test.ts`](./tests/installStatus.snapshot.test.ts): Verified capability schema and installer status payloads.

### Files Changed

- `vite.config.ts` — Scoped client environment variable defines.
- `server/routes/proxy.js` — Google AI server proxy route.
- `services/geminiService.ts` — Client calls migrated to server proxy.
- `services/googleDrive.ts` — Client-safe environment resolution.
- `server/middleware.js` — Generic error handler shielding.
- `index.js` — Static upload authentication protection.
- `server/utils/backupRestore.js` — Modular backup/restore engine and migration helpers.
- `server/routes/app.js` — Disk-backed migration upload endpoint, lock middleware, and cleanup handlers.
- `server/routes/admin.js` — Refactored to use shared `backupRestore.js` routines.
- `server/utils/installStatus.js` — Capability check and diagnostic path/identity redaction.
- `server/utils/installerConfig.js` — Masked runtime secrets.
- `pages/Install.tsx` — Migration card UI, file upload trigger, and migration report card.
- `services/api/app.ts` — Added `migrateFromFullBackup` method and type signatures.
- `types.ts` — Extended `InstallStatus` capabilities.
- `docs/environment.md` — Environment reference documentation.
- `docs/migration.md` — Migration guide and disaster recovery documentation.
- `README.md` — Cross-referenced migration documentation.
- `README.md` — Cross-referenced migration documentation.

---

## [0.16.100] - 2026-10-20 (Release Commit: [`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0))

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

---

## [0.16.99-dev] - 2026-06-27 (development snapshot)

### Features and Functionality

- **Multi-Modal Generation Architecture**: Initial integration of Text, Visual, Motion, and Audio generation pipelines bridging Google Gemini, Pollinations, and experimental NVIDIA NIM engines.
- **Pollinations BYOP (Bring Your Own Pollen)**: Installer-level and runtime credential provisioning enabling direct BYOP token usage for dedicated API quotas.
- **RAG-Assisted Prompt Assistant**: Retrieval-augmented prompt engineering engine utilizing local project vector embeddings, search citations, and session management.
- **Digital Asset Management (DAM) Core**: Offline SQLite persistence, collection galleries, bulk reference asset manipulation, and encrypted backup manifest engine covering conversations and RAG vectors.
- **First-Run Web Installer**: Initial zero-dependency web installer handling database bootstrapping, initial admin provisioning, and system environment verification.

### Code and Architecture

- **`server/db/`**: Schema initialization and migration engine using SQLite3.
- **`server/routes/`**: Foundation REST endpoints for assets, collections, intelligence models, authentication, and system backups.
- **`components/` & `pages/`**: React 18 single-page application structure utilizing Tailwind CSS and HashRouter.


