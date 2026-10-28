# Changelog

All notable changes to **AIMANA Asparagus** are documented in this file.  
This project adheres to [Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/) standards.

For internal technical implementation details and architecture notes, see [CHANGELOG_INTERNAL.md](./CHANGELOG_INTERNAL.md).

---

## [0.16.101] - 2026-10-29

> **Highlights:** Direct Full Baseline backup migration in the first-run installer; streaming ZIP extraction with `yauzl` for large backups up to 1 GB; sensitive data exposure hardening across frontend environment bundles, backend Google AI proxying, and upload authentication; and comprehensive operational guides in [`docs/`](./docs/).

### 🚀 Installation & Backup Migration
- **First-Run Baseline Migration**: Restore full SQLite database snapshots and user-uploaded media files directly from a single System Operations Full Baseline ZIP archive before initial admin account setup (`POST /api/app/bootstrap/migrate`) ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Clean-State Validation**: Dynamic capability checking (`allowBackupMigration`) ensures migration can only run on pristine instances with zero registered users, no existing workspace directory structure, and unfinalized installer state ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Migration Reporting**: Real-time visual progress and post-migration report in the installer UI showing total database rows restored, media assets extracted, source instance version, and non-fatal warnings ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Concurrency Locking**: Installer mutations are locked with a `409 Conflict` barrier while a migration task is actively executing to prevent database corruption ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).

### 🛡️ Security & Sensitive Data Hardening
- **Client Bundle Credential Isolation**: Restricted Vite frontend environment defines to only explicitly allowlisted public variables (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`). Server credentials (`API_KEY`, `AUTH_SECRET`, etc.) are strictly kept out of generated client bundles ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Server-Side Google AI Proxy**: Routed Google AI text generation, multimodal analysis, image generation, and speech requests through an authenticated backend route (`POST /api/proxy/google/generate`), avoiding direct client exposure of server-side Gemini API keys ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Protected Upload Static Serving**: Enforced authenticated session checks (`requireAuth`) on `/storage/uploads` and legacy `/uploads` static file routes to block unauthorized asset retrieval ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Installer Information Disclosure Hardening**: Redacted administrator user identity and absolute filesystem paths from public installer status and summary endpoints (`/api/app/install/status`, `/api/app/install/summary`), and fully masked runtime configuration secrets ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Generic Internal Error Shielding**: Replaced unhandled server error messages with safe generic client responses (`Internal server error`) to prevent leaking internal exception traces, database structures, and runtime internals ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).

### ⚡ Infrastructure & Architecture
- **Streaming Zip Decompression (`yauzl`)**: Migrated installer upload processing from in-memory buffers to streaming disk-backed extraction (`storage/.install-upload-*`), safely handling large multi-hundred-megabyte archives up to 1 GB without Node.js heap exhaustion ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Unified Backup/Restore Engine**: Extracted core backup parsing, topological table ordering, and path traversal security sanitization into a shared utility ([`server/utils/backupRestore.js`](./server/utils/backupRestore.js)), eliminating code duplication between the installer and admin disaster recovery routes ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).

### 📖 Documentation & Operations
- **Manual Migration Guide**: Added [`docs/migration.md`](./docs/migration.md) providing step-by-step procedures for live installer migration, offline zero-downtime database cutovers, and baseline-plus-incremental restore chains ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Environment Reference Guide**: Added [`docs/environment.md`](./docs/environment.md) documenting all security, authentication, AI provider, and chat ingestion configuration variables ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **README Cross-References**: Updated [`README.md`](./README.md) with quick links to migration and manual restore procedures ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Version Bump**: Bumped package manifests to `0.16.101` ([`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571)).
- **Branch Consolidation**: Merged release `0.16.101` and migration features into `beta`.

---

## [0.16.100] - 2026-10-20

> **Highlights:** One-click multi-provider lane renewal across Text, Visual, Motion, and Audio registries; automatic pruning of deprecated upstream models; full-fit thumbnail display in asset cards; and dedicated CI/CD & manual update system specifications.

### 🚀 Checkpoint Hub & AI Intelligence
- **Multi-Lane Provider Sync**: Introduced the **"Renew All Lanes"** action in Checkpoint Hub, executing sequential synchronization across Google Gemini and Pollinations Text, Image, Audio, and Video endpoints with live per-lane progress reporting and aggregate summary banners ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Catalog Reconciliation & Stale Model Pruning**: Automated deletion of deprecated upstream system engines (`isSystem = 1`) during registry synchronization so deleted or renamed provider models no longer persist as phantom engines, while safely preserving user-forged custom models ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Dedicated Video Endpoint**: Corrected Pollinations motion sync to query the dedicated `POLLINATIONS_VIDEO_MODELS_URL` rather than the general media models catalog ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Seed Protection**: Guarded system startup and re-seeding routines so existing synchronized provider catalogs are never overwritten by static fallback seed blueprints ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

### 🎨 Asset Management & User Interface
- **Thumbnail Aspect Ratio Fix**: Enhanced `AssetCard` preview display from `object-cover` to `object-contain`, ensuring generated images and references fit completely inside cards without edge cropping ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Live Registry Cache Invalidation**: Dynamic registry caching now instantly invalidates upon completion of lane renewals via window event dispatching, ensuring immediate availability of new models in creative selectors ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

### 📦 Platform, Documentation & Operations
- **Changelog Documentation**: Added public project changelog ([`CHANGELOG.md`](./CHANGELOG.md)) and internal technical changelog ([`CHANGELOG_INTERNAL.md`](./CHANGELOG_INTERNAL.md)), linked from [`README.md`](./README.md) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Hub Operational Docs**: Documented multi-lane renewal procedures, sync endpoints, and engine reconciliation rules in [`internal.docs/checkpoint-hub.md`](./internal.docs/checkpoint-hub.md) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **CI/CD & Update System Architecture**: Added complete engineering plans for pull-based application updates and private-to-public distribution pipelines in [`internal.todo/`](./internal.todo/) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- **Version Bump**: Bumped package manifests to `0.16.100` ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

---

## [0.16.99-dev] - 2026-06-27

> **Highlights:** Initial public beta release of AIMANA Asparagus, introducing local-first asset management, multi-provider AI creative studio, RAG-assisted prompt engineering, and Pollinations BYOP support.

### 🧠 AI Studio & Multi-Modal Capabilities
- **Multi-Modal Generation**: Integrated generation and editing workflows for Text, Visual, Motion, and Audio powered by Google Gemini, Pollinations, and experimental NVIDIA NIM engines ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).
- **Pollinations BYOP (Bring Your Own Pollen)**: Added user authorization credentials for Pollinations BYOP tier directly in the setup installer and runtime environment ([`1d0a6fe`](https://github.com/rontea/AIMANA-Asparagus/commit/1d0a6fe)).
- **Prompt Assistant & RAG Search**: Added RAG-powered prompt assistant with search citations, session clearing, and knowledge grounding from projects and items ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).
- **Audio & TTS Enhancements**: Added automated MP3 fallback formatting for audio inference routes and synchronized dynamic registry cache controls ([`4901b46`](https://github.com/rontea/AIMANA-Asparagus/commit/4901b46)).

### 📂 Digital Asset Management (DAM)
- **Bulk Studio & Collections**: Added bulk moves for reference images and linked artifacts, collection galleries, and instant dashboard search ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).
- **Local Persistence & Backups**: Secure offline SQLite database with automatic schema migrations and encrypted system backup manifests covering chats and RAG vectors ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).

### ⚙️ Bootstrap & Licensing
- **First-Run Installer**: Interactive web installer supporting database bootstrapping, administrator account creation, and environment checks ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).
- **Open-Source License**: Added official project license ([`2f9febb`](https://github.com/rontea/AIMANA-Asparagus/commit/2f9febb)).
- **Repository Initialization**: Initial project setup, documentation, and asset management guides ([`bd62f1c`](https://github.com/rontea/AIMANA-Asparagus/commit/bd62f1c), [`d6420cf`](https://github.com/rontea/AIMANA-Asparagus/commit/d6420cf), [`c7a0793`](https://github.com/rontea/AIMANA-Asparagus/commit/c7a0793), [`5244281`](https://github.com/rontea/AIMANA-Asparagus/commit/5244281), [`f7c8b57`](https://github.com/rontea/AIMANA-Asparagus/commit/f7c8b57), [`049de95`](https://github.com/rontea/AIMANA-Asparagus/commit/049de95), [`f4a25ba`](https://github.com/rontea/AIMANA-Asparagus/commit/f4a25ba), [`819ff90`](https://github.com/rontea/AIMANA-Asparagus/commit/819ff90), [`97415d7`](https://github.com/rontea/AIMANA-Asparagus/commit/97415d7), [`42a3269`](https://github.com/rontea/AIMANA-Asparagus/commit/42a3269)).

---

## 📜 Commit Reference Log

| Commit | Date | Summary |
| :--- | :--- | :--- |
| [`f9aa1b8`](https://github.com/rontea/AIMANA-Asparagus/commit/f9aa1b8) | 2026-10-29 | docs(changelog): record commit id 5c0f571 for 0.16.101 release |
| [`5c0f571`](https://github.com/rontea/AIMANA-Asparagus/commit/5c0f571) | 2026-10-29 | release: bump to 0.16.101, add installer backup migration, and security data exposure hardening |
| [`a881f9c`](https://github.com/rontea/AIMANA-Asparagus/commit/a881f9c) | 2026-10-20 | docs(changelog): format changelog with clear visual hierarchy, highlights, and commit table |
| [`3f68dcf`](https://github.com/rontea/AIMANA-Asparagus/commit/3f68dcf) | 2026-10-20 | docs(changelog): sanitize commits to match AIMANA-Asparagus git history |
| [`d4ce1c9`](https://github.com/rontea/AIMANA-Asparagus/commit/d4ce1c9) | 2026-10-20 | docs(changelog): record commit id 9d999f0 for 0.16.100 release |
| [`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0) | 2026-10-20 | release: bump to 0.16.100, add changelogs, multi-lane hub renewal, and catalog reconciliation |
| [`1d0a6fe`](https://github.com/rontea/AIMANA-Asparagus/commit/1d0a6fe) | 2026-06-27 | BYOP added |
| [`4901b46`](https://github.com/rontea/AIMANA-Asparagus/commit/4901b46) | 2026-06-27 | fix(backend) Checkpoint hub and audio |
| [`42a3269`](https://github.com/rontea/AIMANA-Asparagus/commit/42a3269) | 2026-06-27 | update readme |
| [`97415d7`](https://github.com/rontea/AIMANA-Asparagus/commit/97415d7) | 2026-06-27 | update readme |
| [`819ff90`](https://github.com/rontea/AIMANA-Asparagus/commit/819ff90) | 2026-06-27 | update readme |
| [`f4a25ba`](https://github.com/rontea/AIMANA-Asparagus/commit/f4a25ba) | 2026-06-26 | update .gitignore and readme |
| [`049de95`](https://github.com/rontea/AIMANA-Asparagus/commit/049de95) | 2026-06-26 | update .gitignore |
| [`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0) | 2026-06-26 | Aimana Asparagus beta code live |
| [`2f9febb`](https://github.com/rontea/AIMANA-Asparagus/commit/2f9febb) | 2026-06-02 | doc(License) added license |
| [`f7c8b57`](https://github.com/rontea/AIMANA-Asparagus/commit/f7c8b57) | 2026-05-22 | Update README.md |
| [`5244281`](https://github.com/rontea/AIMANA-Asparagus/commit/5244281) | 2026-05-22 | Update README with project description and image |
| [`c7a0793`](https://github.com/rontea/AIMANA-Asparagus/commit/c7a0793) | 2026-05-22 | Add image to README for visual enhancement |
| [`d6420cf`](https://github.com/rontea/AIMANA-Asparagus/commit/d6420cf) | 2026-05-22 | Change project title to 'AIMANA Asparagus' |
| [`bd62f1c`](https://github.com/rontea/AIMANA-Asparagus/commit/bd62f1c) | 2026-05-22 | Initial commit |
