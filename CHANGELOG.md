# Changelog

Notable changes to AIMANA Asparagus are recorded here. Earlier implementation details remain available in Git history.

## [0.16.100] - 2026-10-20

### Added

- Added a "Renew All Lanes" action in Checkpoint Hub to run multi-provider registry syncs across text, image, audio, and video lanes in a single sequence ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added CI/CD pipeline planning and application update system architecture specifications in `internal.todo/` ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added Checkpoint Hub operations and renewal documentation in `internal.docs/checkpoint-hub.md` ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added internal development changelog tracking in `CHANGELOG_INTERNAL.md` ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

### Improved

- Improved Checkpoint Hub registry reconciliation to automatically purge outdated provider model identifiers when upstream catalogs update ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Improved asset card thumbnail presentation to fit within containers without edge clipping (`object-contain`) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Updated project versioning to `0.16.100` in package manifests ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

### Fixed

- Fixed an issue where system startup re-seeding could overwrite live synchronized Pollinations provider model catalogs ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Fixed Pollinations video registry synchronization to query the dedicated video endpoint ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

### Commits

- [`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0) release: bump to 0.16.100, add changelogs, multi-lane hub renewal, and catalog reconciliation

## [0.16.99-dev] - 2026-06-27 (development snapshot)

### Added

- Added Pollinations BYOP (Bring Your Own Pollen) authorization configuration in installer and runtime environment ([`1d0a6fe`](https://github.com/rontea/AIMANA-Asparagus/commit/1d0a6fe)).
- Added Aimana Asparagus public beta codebase with local-first asset management, AI multi-model workspace (Google Gemini, Pollinations, NVIDIA NIM), RAG-powered prompt assistant, bulk reference image operations, and collection galleries ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0)).
- Added project open-source license ([`2f9febb`](https://github.com/rontea/AIMANA-Asparagus/commit/2f9febb)).

### Changed

- Improved audio generation support and Checkpoint Hub dynamic registry cache handling ([`4901b46`](https://github.com/rontea/AIMANA-Asparagus/commit/4901b46)).
- Updated README documentation, repository configuration, and gitignore patterns ([`42a3269`](https://github.com/rontea/AIMANA-Asparagus/commit/42a3269), [`97415d7`](https://github.com/rontea/AIMANA-Asparagus/commit/97415d7), [`819ff90`](https://github.com/rontea/AIMANA-Asparagus/commit/819ff90), [`f4a25ba`](https://github.com/rontea/AIMANA-Asparagus/commit/f4a25ba), [`049de95`](https://github.com/rontea/AIMANA-Asparagus/commit/049de95)).
- Initialized repository branding and project documentation ([`bd62f1c`](https://github.com/rontea/AIMANA-Asparagus/commit/bd62f1c), [`d6420cf`](https://github.com/rontea/AIMANA-Asparagus/commit/d6420cf), [`c7a0793`](https://github.com/rontea/AIMANA-Asparagus/commit/c7a0793), [`5244281`](https://github.com/rontea/AIMANA-Asparagus/commit/5244281), [`f7c8b57`](https://github.com/rontea/AIMANA-Asparagus/commit/f7c8b57)).

### Commits

- [`1d0a6fe`](https://github.com/rontea/AIMANA-Asparagus/commit/1d0a6fe) BYOP added
- [`4901b46`](https://github.com/rontea/AIMANA-Asparagus/commit/4901b46) fix(backend) Checkpoint hub and audio
- [`42a3269`](https://github.com/rontea/AIMANA-Asparagus/commit/42a3269) update readme
- [`97415d7`](https://github.com/rontea/AIMANA-Asparagus/commit/97415d7) update readme
- [`819ff90`](https://github.com/rontea/AIMANA-Asparagus/commit/819ff90) update readme
- [`f4a25ba`](https://github.com/rontea/AIMANA-Asparagus/commit/f4a25ba) update .gitignore and readme
- [`049de95`](https://github.com/rontea/AIMANA-Asparagus/commit/049de95) update .gitignore
- [`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0) Aimana Asparagus beta code live
- [`2f9febb`](https://github.com/rontea/AIMANA-Asparagus/commit/2f9febb) doc(License) added license
- [`f7c8b57`](https://github.com/rontea/AIMANA-Asparagus/commit/f7c8b57) Update README.md
- [`5244281`](https://github.com/rontea/AIMANA-Asparagus/commit/5244281) Update README with project description and image
- [`c7a0793`](https://github.com/rontea/AIMANA-Asparagus/commit/c7a0793) Add image to README for visual enhancement
- [`d6420cf`](https://github.com/rontea/AIMANA-Asparagus/commit/d6420cf) Change project title to 'AIMANA Asparagus'
- [`bd62f1c`](https://github.com/rontea/AIMANA-Asparagus/commit/bd62f1c) Initial commit
