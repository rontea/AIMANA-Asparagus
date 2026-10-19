# Changelog

Notable changes to AIMANA Asparagus are recorded here. Earlier implementation details remain available in Git history.

## [0.16.100] - 2026-10-20

### Added

- Added a "Renew All Lanes" action in Checkpoint Hub to run multi-provider registry syncs across text, image, audio, and video lanes in a single sequence ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added CI/CD pipeline planning and application update system architecture specifications (`internal.todo/plan_cicd.md`, `internal.todo/todo-owner-application-update-system-2026-07-21.md`) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added Checkpoint Hub operations and renewal documentation (`internal.docs/checkpoint-hub.md`) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).
- Added internal development changelog tracking (`CHANGELOG_INTERNAL.md`) ([`9d999f0`](https://github.com/rontea/AIMANA-Asparagus/commit/9d999f0)).

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

- Added Pollinations BYOP (Bring Your Own Pollen) authorization configuration ([`1d0a6fe`](https://github.com/rontea/AIMANA-Asparagus/commit/1d0a6fe), upstream [`1eac25c`](https://github.com/rontea/AIMANA/commit/1eac25c), [`51b0578`](https://github.com/rontea/AIMANA/commit/51b0578)).
- Added experimental NVIDIA NIM models and provider configuration ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`4602bc5`](https://github.com/rontea/AIMANA/commit/4602bc5)).
- Added a RAG-powered Prompt Assistant with source links and session controls ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`6604d45`](https://github.com/rontea/AIMANA/commit/6604d45), [`64ce130`](https://github.com/rontea/AIMANA/commit/64ce130), [`dbafecc`](https://github.com/rontea/AIMANA/commit/dbafecc)).
- Added bulk moves for reference images and linked artifacts, plus collection galleries and dashboard search ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`381834c`](https://github.com/rontea/AIMANA/commit/381834c), [`3398d72`](https://github.com/rontea/AIMANA/commit/3398d72), [`8d0d657`](https://github.com/rontea/AIMANA/commit/8d0d657)).
- Added project open-source license ([`2f9febb`](https://github.com/rontea/AIMANA-Asparagus/commit/2f9febb)).

### Changed

- Improved audio generation and transcription support, and updated Checkpoint Hub registry caching ([`4901b46`](https://github.com/rontea/AIMANA-Asparagus/commit/4901b46), upstream [`309897e`](https://github.com/rontea/AIMANA/commit/309897e)).
- Improved installer configuration, first-run setup, and application readiness reporting ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`bc448d7`](https://github.com/rontea/AIMANA/commit/bc448d7), [`9f4d9fb`](https://github.com/rontea/AIMANA/commit/9f4d9fb), [`60edd0d`](https://github.com/rontea/AIMANA/commit/60edd0d)).
- Improved Prompt Assistant retrieval and chat source handling; included chat and RAG data in system backups ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`b130c63`](https://github.com/rontea/AIMANA/commit/b130c63), [`dbafecc`](https://github.com/rontea/AIMANA/commit/dbafecc), [`fe0b788`](https://github.com/rontea/AIMANA/commit/fe0b788)).
- Optimized project and gallery loading, and improved Bulk Studio's multi-task generation and JSON validation ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`79e0acd`](https://github.com/rontea/AIMANA/commit/79e0acd)).
- Updated README documentation, repository configuration, and gitignore ([`42a3269`](https://github.com/rontea/AIMANA-Asparagus/commit/42a3269), [`97415d7`](https://github.com/rontea/AIMANA-Asparagus/commit/97415d7), [`819ff90`](https://github.com/rontea/AIMANA-Asparagus/commit/819ff90), [`f4a25ba`](https://github.com/rontea/AIMANA-Asparagus/commit/f4a25ba), [`049de95`](https://github.com/rontea/AIMANA-Asparagus/commit/049de95)).

### Fixed

- Fixed installer startup and bootstrap failures, session cookie handling, and prompt collection operations ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`0818b09`](https://github.com/rontea/AIMANA/commit/0818b09), [`a13f677`](https://github.com/rontea/AIMANA/commit/a13f677), [`1aa91c1`](https://github.com/rontea/AIMANA/commit/1aa91c1)).
- Fixed Pollinations credit display and reduced unnecessary dashboard chat-capture requests ([`98b22d0`](https://github.com/rontea/AIMANA-Asparagus/commit/98b22d0), upstream [`736cd46`](https://github.com/rontea/AIMANA/commit/736cd46), [`663b11e`](https://github.com/rontea/AIMANA/commit/663b11e)).

### Commits

#### Distribution Commits (`rontea/AIMANA-Asparagus`)

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

#### Upstream Development Snapshot Commits (`rontea/AIMANA`)

- [`1eac25c`](https://github.com/rontea/AIMANA/commit/1eac25c) BYOP added
- [`51b0578`](https://github.com/rontea/AIMANA/commit/51b0578) BYOP added
- [`309897e`](https://github.com/rontea/AIMANA/commit/309897e) fix(backend) audio generation issue and checkpoint hub update
- [`4602bc5`](https://github.com/rontea/AIMANA/commit/4602bc5) added nvidia experimental
- [`1aa91c1`](https://github.com/rontea/AIMANA/commit/1aa91c1) fix issue on component prompt collection
- [`df3cc39`](https://github.com/rontea/AIMANA/commit/df3cc39) update setting and bump version
- [`60edd0d`](https://github.com/rontea/AIMANA/commit/60edd0d) fix(backend) fix installer
- [`a13f677`](https://github.com/rontea/AIMANA/commit/a13f677) update(chore) update-browserslist-db@latest fix(backedn) server issue
- [`9f4d9fb`](https://github.com/rontea/AIMANA/commit/9f4d9fb) fix(backend) fix issue on server not running on init installer
- [`bc448d7`](https://github.com/rontea/AIMANA/commit/bc448d7) fix(backend) installer first init run failure
- [`79314d1`](https://github.com/rontea/AIMANA/commit/79314d1) docs() update readme and added instruction of private to public release
- [`fe0b788`](https://github.com/rontea/AIMANA/commit/fe0b788) Restore normal AI chat route
- [`381834c`](https://github.com/rontea/AIMANA/commit/381834c) feat(frontend/backend) added bulk move on Reference Image and linked artifacts
- [`0818b09`](https://github.com/rontea/AIMANA/commit/0818b09) fix(backend) login session cookie fix
- [`663b11e`](https://github.com/rontea/AIMANA/commit/663b11e) Fix capture project destination refresh
- [`736cd46`](https://github.com/rontea/AIMANA/commit/736cd46) Reduce dashboard chat capture fetch burst
- [`b130c63`](https://github.com/rontea/AIMANA/commit/b130c63) Ensure system backups cover chat and RAG data
- [`dbafecc`](https://github.com/rontea/AIMANA/commit/dbafecc) Update AIMA chat and prompt assistant retrieval
- [`64ce130`](https://github.com/rontea/AIMANA/commit/64ce130) Improve chat source links and session clearing
- [`6604d45`](https://github.com/rontea/AIMANA/commit/6604d45) Add RAG-powered Prompt Assistant
- [`79bb6fb`](https://github.com/rontea/AIMANA/commit/79bb6fb) todo() added todo for our Ai search rag chatbot
- [`a784f4f`](https://github.com/rontea/AIMANA/commit/a784f4f) feat(backend) added internal tool for private to public push
- [`3398d72`](https://github.com/rontea/AIMANA/commit/3398d72) feat(frontend) added gallery view on collection
- [`79e0acd`](https://github.com/rontea/AIMANA/commit/79e0acd) fix(frontend) added collection adding on new project
- [`8d0d657`](https://github.com/rontea/AIMANA/commit/8d0d657) feat(backend,frontend) update dashboard view and add search on top navigation
