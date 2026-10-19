# Todo: Owner Application Update And Release System

Date: `2026-07-21`
Status: `proposed`
Owner: `platform`

Detailed CI/CD implementation plan: [AIMANA CI/CD Plan](./plan_cicd.md)

## Goal

Create a safe, repeatable path for promoting bug fixes, features, and other application changes from the AIMANA development workspace into the AIMANA Asparagus production distribution, then allow an authorized application owner to discover and install official releases from the AIMANA interface.

The system must preserve customer data and configuration, verify that update packages are authentic, recover from failed updates, and never treat a browser reload as an application installation.

## Current Deployment Topology

### Development workspace

- Local path: `C:\Projects\aimana`
- Repository: `https://github.com/rontea/AIMANA.git`
- Branch: `main`
- Purpose: implementation, tests, documentation, and release creation
- Current reviewed version: `0.16.99-dev`

### Production distribution workspace

- Local path: `C:\Projects\AIMANA-Asparagus`
- Repository: `https://github.com/rontea/AIMANA-Asparagus.git`
- Branch: `beta`
- Purpose: production validation and distribution of owner-installable releases
- Current reviewed version: `0.16.99-dev`

### Repository relationship found during review

- The workspaces use separate repositories and unrelated Git histories.
- Development contains additional tracked files that are not present in production.
- Some shared runtime files differ between the two workspaces.
- Both currently report the same application version even though their code is not identical.
- Production reported `package-lock.json` as modified, but its normalized Git object hash matched the committed file during review. Treat this as a working-tree metadata or line-ending condition unless a later content diff proves otherwise.
- The public `rontea/AIMANA-Asparagus` repository had no published GitHub Releases when reviewed on `2026-07-21`; the release feed and immutable artifacts still need to be created.

## Confirmed Owner Update Experience

The required experience for someone who already has AIMANA installed is:

1. The owner installs an initial release once, for example `1.0.0`.
2. Development produces a later bug-fix or feature release, for example `1.0.2` for a patch or `1.2.0` for a compatible feature release.
3. AIMANA detects the official release from `rontea/AIMANA-Asparagus`.
4. The existing **Settings -> Client Update -> Manual Release Control** section presents the release.
5. The owner approves the update in the interface; no website visit, ZIP download, file copying, command prompt, Git operation, reinstall, or manual data migration is required.
6. AIMANA downloads only an application release artifact. The artifact does not contain the owner's database, uploads, secrets, or configuration.
7. The updater preserves persistent data in place, applies only required application/database migrations, restarts AIMANA, and reconnects the interface.
8. If the new release is unhealthy, AIMANA rolls back without asking the owner to reconstruct the installation manually.

"No interaction" means no manual interaction with release files, the filesystem, Git, npm, the command line, or data migration. For the first secure release, one explicit owner approval and reauthentication in the existing update interface remain required. Fully unattended installation may be added later as an explicit opt-in policy after rollback and recovery behavior is proven.

The first implementation may download a complete, compact application artifact because this is safer to verify and roll back than a file-by-file patch. This is not a full application reinstall: persistent data is excluded and retained. Differential/delta artifacts may be added later for bandwidth efficiency, but they are not required to deliver the no-manual-migration experience.

## Definitions

### Application version

The SemVer identifier for one installable AIMANA release, sourced from the root `package.json`. A production artifact must have exactly one immutable application version.

Examples:

- `0.16.100` for a backward-compatible bug fix
- `0.17.0` for a backward-compatible feature release
- `0.17.0-beta.1` for a beta prerelease
- `1.0.0` for a stable release that introduces an explicitly managed compatibility boundary

### Build identity

Immutable metadata that identifies the exact source used to create an artifact. It should include the application version, source commit SHA, build timestamp, and update channel. Version alone must not be used to distinguish two different builds with different code.

### Update channel

A named release stream selected by an installation.

- `stable`: production-ready releases
- `beta`: owner-approved prereleases
- `development`: local development builds; never offered to production installations

### Release manifest

A small machine-readable document describing the latest official release for a channel. It is metadata only and must not execute code.

Required fields:

- schema version
- application version
- channel
- release ID
- source commit SHA
- publication timestamp
- artifact URL
- artifact size
- artifact SHA-256 checksum
- release notes or release-notes URL
- minimum supported Node.js version
- whether a restart is required
- optional minimum version that can update directly
- optional database migration metadata
- optional signing key ID and signature

### Release artifact

An immutable archive generated from a clean, tested source commit. It contains only files required to run or install that release.

### Installed version

The application version and build identity currently active on an installation.

### Available version

The newest valid version in the installation's selected channel that is semantically newer than the installed version and compatible with that installation.

### Staging directory

A temporary directory outside the active release directory where an artifact is downloaded, verified, extracted, and validated before activation.

### Persistent paths

Installation-owned state that must survive every code update and must never be included in or overwritten by a release artifact.

At minimum:

- `.env`
- `storage/`, including the SQLite database and uploads
- extension host configuration
- backups
- installation identity and update preferences
- operator-managed service configuration

### Update helper

An external process responsible for changing the active application files and restarting the application. It must not depend on the running Node process being able to overwrite or restart itself.

### Preflight

Read-only checks performed before installation, including runtime compatibility, disk space, write permissions, database health, update lock state, artifact availability, and backup readiness.

### Activation

The controlled switch from the previous verified application release to the staged release.

### Health check

A bounded post-activation test that confirms the new server starts, exposes the expected version/build identity, can open its database, and returns an operational readiness result.

### Rollback

Restoring the previous application release and compatible persisted state after installation or health-check failure. Database rollback must be explicitly designed around migration reversibility and backup restoration.

## Current Capability And Limitations

What exists today:

- The frontend embeds the root package version at build time.
- `GET /api/app/version` reports the running server's local package version.
- the client polls the server and compares the two version strings
- the Settings page exposes Client Update only to `admin-root`
- Update Now performs `window.location.reload()`
- `scripts/upgrade-app.mjs` backs up selected paths, runs `npm install`, and rebuilds the frontend

What this means:

- The current feature can detect an old browser bundle talking to a newly deployed server.
- It cannot discover a release that has not already been installed on the server.
- It cannot download, verify, install, activate, restart, or roll back application code.
- A bug-fix commit without a new version and deployed build cannot trigger an update.
- String inequality is not a safe substitute for semantic version ordering.

## Product Decisions

- [ ] Keep `C:\Projects\aimana` as the only development source of truth.
- [ ] Treat AIMANA Asparagus as a release/distribution target, not a second manually maintained development codebase.
- [ ] Use immutable release artifacts instead of copying the live development directory into production.
- [ ] Use the `beta` channel for AIMANA Asparagus until stable-channel criteria are defined.
- [ ] Require a unique SemVer version for every published artifact.
- [ ] Reject republishing different bytes under an existing version.
- [ ] Keep update installation manual and owner-approved; background checks may be automatic.
- [ ] Restrict installation to the installation owner/super-user and enforce this on the server.
- [ ] Require reauthentication immediately before installation.
- [ ] Never update `.env`, `storage/`, or operator-owned configuration from a release archive.
- [ ] Do not support arbitrary artifact URLs supplied by the browser.
- [ ] Use a fixed trusted release origin and verified checksums; add cryptographic signatures before stable-channel rollout.
- [ ] Make database migration and rollback policy part of the release contract.
- [ ] Require the normal owner update path to complete entirely through the existing Settings update section after one approval and reauthentication.
- [ ] Do not require owners to visit GitHub, download an archive, copy files, run Git/npm commands, or migrate data manually.
- [ ] Keep persistent data outside the replaceable application release boundary.

## Target Release Flow

```text
Development main
    -> tests and release validation
    -> explicit version and build identity
    -> immutable artifact plus manifest
    -> AIMANA Asparagus release channel
    -> production update check
    -> owner approval and reauthentication
    -> external update helper
    -> backup, stage, verify, activate, restart
    -> health check
    -> success or rollback
```

## Versioning Policy

- [ ] Replace production `-dev` identifiers with release or prerelease identifiers.
- [ ] Use patch increments for backward-compatible bug fixes.
- [ ] Use minor increments for backward-compatible features.
- [ ] Use major increments for deliberately incompatible changes.
- [ ] Use ordered prereleases such as `0.17.0-beta.1`; do not use an unnumbered production `-dev` suffix.
- [ ] Compare versions with a tested SemVer implementation.
- [ ] Treat equal version plus different build identity as an invalid/repacked release, not a normal update.
- [ ] Never advertise a lower version as an update.
- [ ] Define whether prerelease installations may move to stable releases automatically.
- [ ] Keep the root `package.json`, root entries in `package-lock.json`, manifest, and built client metadata consistent.

## Example Release Manifest

```json
{
  "schemaVersion": 1,
  "releaseId": "aimana-0.16.100",
  "version": "0.16.100",
  "channel": "beta",
  "sourceCommit": "<full-commit-sha>",
  "publishedAt": "2026-07-21T12:00:00.000Z",
  "artifact": {
    "url": "https://github.com/rontea/AIMANA-Asparagus/releases/download/v0.16.100/aimana-v0.16.100.zip",
    "size": 0,
    "sha256": "<sha256>"
  },
  "requirements": {
    "node": ">=18.0.0",
    "minimumUpdatableVersion": "0.16.0"
  },
  "database": {
    "migrationRequired": false,
    "schemaVersion": 1,
    "rollbackMode": "application-only"
  },
  "restartRequired": true,
  "releaseNotesUrl": "<official-release-notes-url>",
  "signature": {
    "keyId": "<release-key-id>",
    "value": "<signature>"
  }
}
```

## Release Artifact Contract

Include:

- root runtime source files
- `server/`
- frontend source required for a local build, if local builds remain supported
- prebuilt `dist/` for an artifact-first installation
- `components/`, `hooks/`, `pages/`, `services/`, `types/`, and `utils/` as required
- runtime extension packages and host configuration templates
- `package.json`
- committed `package-lock.json`
- migration files
- release metadata and notices

Exclude:

- `.git/`
- `.env` and `.env.local`
- `storage/`
- `node_modules/`
- `backups/`
- `.tmp/`
- `.codex-logs/`
- local logs
- temporary investigation files
- development databases and uploaded assets
- machine-specific service credentials or configuration

## Phase 0: Normalize Development And Distribution

- [ ] Document which shared files are intentionally different in AIMANA Asparagus.
- [ ] Decide whether production branding belongs in configuration, an extension, or a release overlay.
- [ ] Remove accidental source divergence between the two repositories.
- [ ] Create an allowlisted export process from development to distribution.
- [ ] Ensure the export process never reads or packages local secrets or persistent data.
- [ ] Add a dry-run mode that reports added, changed, omitted, and protected files.
- [ ] Fail export when the development working tree is dirty.
- [ ] Fail export when version metadata is inconsistent.
- [ ] Preserve any intentional production-only README, license, channel, or branding files.
- [ ] Decide whether the distribution repository stores generated artifacts, release metadata, or only release automation.

Acceptance criteria:

- A release can be reproduced from one development commit.
- Runtime code is not manually edited in the production workspace.
- Intentional differences between repositories are explicit and tested.

## Phase 1: Release Builder

- [ ] Add a release command that accepts an explicit version and channel.
- [ ] Validate SemVer and reject an already-published version.
- [ ] Synchronize `package.json` and `package-lock.json` version metadata.
- [ ] Run TypeScript compilation and the production build.
- [ ] Run frontend, server, installer-smoke, and extension validation suites.
- [ ] Generate the immutable release artifact from an allowlist.
- [ ] Generate SHA-256 checksums.
- [ ] Generate the release manifest and release notes template.
- [ ] Embed version, channel, commit SHA, and build timestamp in the client and server.
- [ ] Verify that the artifact contains no persistent or secret paths.
- [ ] Verify the artifact by installing it into a disposable clean directory.
- [ ] Publish only after every required check passes.
- [ ] Add a GitHub Actions release workflow for tagged or manually approved releases.

Acceptance criteria:

- The same source commit and lockfile produce an equivalent artifact.
- A published version maps to exactly one artifact checksum.
- The release smoke test starts the artifact and confirms its reported build identity.

## Phase 1A: CI/CD Release Automation

Use [AIMANA CI/CD Plan](./plan_cicd.md) as the detailed implementation contract for workflow files, repository settings, credentials, promotion, publication, and release consumption.

### Development CI

- [ ] Add `.github/workflows/ci.yml` to `rontea/AIMANA`.
- [ ] Run CI for pull requests targeting `main` and pushes to `main`.
- [ ] Install dependencies from the committed lockfile with `npm ci`.
- [ ] Run the production build, frontend tests, server tests, extension validation, and installer smoke test.
- [ ] Use Ubuntu for the normal fast validation suite.
- [ ] Use Windows for installer, updater, filesystem, SQLite-native, process-restart, and rollback coverage.
- [ ] Upload useful diagnostic artifacts only when needed and ensure they contain no secrets or persistent data.
- [ ] Default workflow token permissions to read-only.
- [ ] Keep all promotion and release credentials unavailable to pull-request jobs.

### Branch And Environment Protection

- [ ] Protect AIMANA `main` with pull-request and required-status-check rules.
- [ ] Protect AIMANA Asparagus `beta` and `main`.
- [ ] Disable force pushes and deletion for release branches.
- [ ] Require explicit review for release-critical workflow and updater changes.
- [ ] Create protected `beta-release` and `stable-release` GitHub Environments.
- [ ] Require owner/reviewer approval before a publication job runs.
- [ ] Restrict each environment to its matching protected branch/channel.
- [ ] Add release concurrency controls so two releases cannot publish to the same channel simultaneously.

### Cross-Repository Promotion

- [ ] Add `.github/workflows/promote-asparagus.yml` to `rontea/AIMANA`.
- [ ] Trigger promotion manually only after the selected development commit passes required CI.
- [ ] Accept explicit version, channel, source commit, and release-notes inputs.
- [ ] Generate an allowlisted distribution export instead of copying the live development directory.
- [ ] Preserve intentional AIMANA Asparagus branding, license, channel, and public-documentation files.
- [ ] Create a `release/<version>` branch and pull request in `rontea/AIMANA-Asparagus`.
- [ ] Target `beta` for beta releases and `main` for stable releases.
- [ ] Include source commit, test provenance, version, channel, and change summary in the promotion pull request.
- [ ] Use a narrowly scoped GitHub App for cross-repository access; do not use a personal token as the permanent design.
- [ ] Store the GitHub App ID/private key only in a protected environment.
- [ ] Grant the GitHub App only required read access to AIMANA and contents/pull-request access to AIMANA Asparagus.

### Distribution CI

- [ ] Add or replace `.github/workflows/ci.yml` in AIMANA Asparagus.
- [ ] Run it for pull requests and pushes affecting both `beta` and `main`.
- [ ] Repeat the complete build and test suite against the exact distribution source.
- [ ] Verify package/lockfile version consistency and promoted source build identity.
- [ ] Verify protected paths and secrets are absent from the artifact.
- [ ] Clean-install and smoke-test the candidate artifact.
- [ ] Simulate an upgrade from the preceding supported release.
- [ ] Verify database, uploads, accounts, projects, prompts, settings, secrets, and extension configuration survive the simulated update.
- [ ] Reject downgrade and equal-version/different-build candidates.

### GitHub Release Publication

- [ ] Add `.github/workflows/release.yml` to AIMANA Asparagus.
- [ ] Initially trigger publication with an owner-approved `workflow_dispatch`.
- [ ] Re-run release validation after environment approval.
- [ ] Reject an existing version, tag, release, or conflicting artifact checksum.
- [ ] Build the publication artifact exactly once and calculate metadata from the published bytes.
- [ ] Create stable tags such as `v1.0.2` and prerelease tags such as `v1.2.0-beta.1`.
- [ ] Mark beta GitHub Releases as prereleases.
- [ ] Upload the application artifact, update manifest, checksums, release notes, and verification metadata.
- [ ] Generate GitHub artifact provenance attestation and an SBOM where supported.
- [ ] Verify the uploaded release-asset digest through the GitHub API.
- [ ] Limit the publication job to required `contents`, `id-token`, and `attestations` permissions.
- [ ] Record the release URL, source commit, artifact digest, channel, and workflow run in the release summary.

Acceptance criteria:

- A development pull request cannot merge until required CI succeeds.
- A selected development commit can be promoted without manual source copying.
- The distribution repository validates the exact source that will be published.
- Publishing requires a protected-environment approval.
- Each version maps to one immutable release artifact, digest, manifest, source commit, and provenance record.
- No CI/CD job connects directly to an installed/customer machine; installations pull official releases through the updater.

## Phase 2: Command-Line Production Updater

- [ ] Implement `npm run update:check` as a non-mutating check.
- [ ] Implement `npm run update:app` as the owner/operator installation command.
- [ ] Read the update channel from installation-owned configuration.
- [ ] Acquire an exclusive update lock.
- [ ] Reject concurrent update attempts.
- [ ] Fetch the manifest from a fixed trusted release origin.
- [ ] Validate manifest schema, channel, SemVer, compatibility, and origin.
- [ ] Download into a unique staging directory.
- [ ] Enforce download size, timeout, redirect, and content-type limits.
- [ ] Verify the artifact SHA-256 before extraction.
- [ ] Reject archive traversal, absolute paths, links, duplicate paths, and protected paths.
- [ ] Run preflight checks before changing active files.
- [ ] Create an application backup and a SQLite-safe database backup.
- [ ] Record an update journal before every mutating stage.
- [ ] Install locked dependencies with `npm ci` where applicable.
- [ ] Validate configuration compatibility without overwriting configuration.
- [ ] Run database migrations under an explicit migration policy.
- [ ] Activate the staged release atomically where the platform permits.
- [ ] Restart through an external helper or service manager.
- [ ] Run a bounded health check after restart.
- [ ] Roll back application files automatically on failure.
- [ ] Define database restoration behavior for failed irreversible migrations.
- [ ] Retain a configurable number of verified previous releases.
- [ ] Clean abandoned staging directories safely.
- [ ] Emit structured logs without secrets.

Acceptance criteria:

- Updating changes application code but preserves `.env`, database, uploads, and extension configuration.
- An interrupted download leaves the active release untouched.
- A failed startup restores the previous runnable release.
- Re-running the updater after interruption produces a deterministic recovery result.

## Phase 3: Remote Update API

- [ ] Add an authenticated endpoint to retrieve installed build identity.
- [ ] Add an authenticated endpoint to check the configured release channel.
- [ ] Return installed version, available version, compatibility, notes, size, and check timestamp.
- [ ] Cache successful remote checks for a bounded interval.
- [ ] Distinguish offline, invalid-manifest, incompatible, and no-update states.
- [ ] Add an owner-only endpoint to begin installation.
- [ ] Require recent privileged reauthentication for the install endpoint.
- [ ] Never accept a client-provided artifact URL, command, filesystem path, or checksum override.
- [ ] Return an update operation ID rather than keeping one HTTP request open through restart.
- [ ] Add operation-status and update-history endpoints.
- [ ] Record initiating user, source IP where appropriate, versions, timestamps, result, and failure stage in the audit trail.
- [ ] Apply rate limits and request replay protection.

Acceptance criteria:

- A normal admin or user cannot start an update by calling the API directly.
- The browser cannot redirect the updater to an untrusted release.
- Update state remains inspectable after the application restarts.

## Phase 4: Owner Interface

- [ ] Rename the current section from `Client Update` to `Application Update`.
- [ ] Show installed version and build identity.
- [ ] Show selected channel and latest compatible release.
- [ ] Show release notes, publication date, artifact size, and restart requirement.
- [ ] Preserve `Check for Updates` as a read-only action.
- [ ] Replace the current reload-only Update Now behavior with an owner installation flow.
- [ ] Require confirmation and privileged reauthentication.
- [ ] Warn that the application will restart and active work should be saved.
- [ ] Display preflight, backup, download, verification, staging, activation, restart, health-check, success, and rollback states.
- [ ] Reconnect automatically after restart with a bounded timeout.
- [ ] Confirm that the newly reported build identity matches the requested release.
- [ ] Provide actionable failure details without exposing secrets or internal tokens.
- [ ] Keep a separate `Reload Client` action when only browser assets are stale.
- [ ] Add accessibility and keyboard-flow coverage for confirmation and progress states.
- [ ] Ensure the complete normal update flow requires no external website, downloaded file handling, command prompt, Git client, npm command, or manual data migration.

Acceptance criteria:

- Only the installation owner sees and can use Install Update.
- Closing or refreshing the browser does not cancel or corrupt an active update.
- The interface accurately reports success, failure, or rollback after reconnecting.
- An owner can move from an older installed release to a compatible bug-fix or feature release using only the existing Settings update section.
- Projects, assets, uploads, prompts, accounts, settings, and secrets remain available without export/import or other manual migration.

## Phase 5: External Update Helper And Restart

- [ ] Define the Windows service/process ownership model used by AIMANA Asparagus.
- [ ] Place the update helper outside the versioned application directory.
- [ ] Pass the helper a one-time, narrowly scoped update plan.
- [ ] Ensure the helper validates the plan and artifact again before activation.
- [ ] Stop the application gracefully with a timeout.
- [ ] Preserve the previous release as an atomic rollback target.
- [ ] Activate the new release without modifying persistent paths.
- [ ] Start the application through the configured service manager.
- [ ] Poll the local health endpoint.
- [ ] Roll back and restart the previous release when health checks fail.
- [ ] Protect the helper executable/script and its configuration from non-owner modification.
- [ ] Define equivalent systemd behavior for future Linux installations.

## Phase 6: Database Migration Safety

- [ ] Add a host database schema version independent of the application version.
- [ ] Classify migrations as reversible, forward-compatible, or restore-required.
- [ ] Back up SQLite using a database-safe mechanism rather than copying an actively written file.
- [ ] Verify the backup before activation.
- [ ] Prevent an old application release from opening an incompatible migrated database.
- [ ] Define maintenance mode or write quiescing during migration.
- [ ] Store migration results in the update journal.
- [ ] Test large production-like databases and uploads without copying uploads unnecessarily.

## Phase 7: Security Hardening

- [ ] Sign manifests or artifacts with an offline-controlled release key.
- [ ] Pin and rotate trusted public keys by key ID.
- [ ] Require HTTPS and reject insecure redirect targets.
- [ ] Restrict release hosts with an explicit allowlist.
- [ ] Verify both checksum and signature before extraction.
- [ ] Apply decompressed-size and file-count limits to prevent archive bombs.
- [ ] Never execute lifecycle scripts from an untrusted or unverified package.
- [ ] Review npm dependency installation risks and production dependency policy.
- [ ] Remove avoidable `latest` dependency ranges from the release contract.
- [ ] Redact authorization headers, tokens, `.env` values, and signed URLs from logs.
- [ ] Add audit events for check, approve, download, verify, activate, restart, rollback, and failure.
- [ ] Threat-model compromised release hosting, local privilege escalation, replay, downgrade, and partial-write scenarios.

## Phase 8: Test Matrix

### Version behavior

- [ ] older stable to newer patch
- [ ] older stable to newer minor
- [ ] beta to later beta
- [ ] beta to stable according to channel policy
- [ ] equal version and equal build identity
- [ ] equal version and different build identity
- [ ] attempted downgrade
- [ ] malformed or missing version
- [ ] incompatible Node.js requirement

### Artifact behavior

- [ ] valid artifact and checksum
- [ ] checksum mismatch
- [ ] invalid signature
- [ ] truncated download
- [ ] unavailable release host
- [ ] malicious traversal path
- [ ] protected persistent path in archive
- [ ] excessive extracted size or file count

### Installation behavior

- [ ] insufficient disk space
- [ ] unwritable release or staging directory
- [ ] backup failure
- [ ] dependency installation failure
- [ ] migration failure
- [ ] process termination during every update stage
- [ ] new server fails to start
- [ ] health check times out
- [ ] rollback succeeds
- [ ] rollback fails and provides manual recovery instructions

### Data preservation

- [ ] `.env` unchanged
- [ ] SQLite database retained or safely migrated
- [ ] uploads unchanged
- [ ] extension host configuration unchanged
- [ ] update channel and installation identity retained
- [ ] previous release retained according to policy

### Authorization

- [ ] unauthenticated request rejected
- [ ] normal user rejected
- [ ] normal admin rejected if owner-only policy remains
- [ ] stale privileged authorization rejected
- [ ] owner with recent reauthentication accepted
- [ ] manipulated client payload cannot change source URL or filesystem target

## Operational Recovery Requirements

- [ ] Document the exact backup location and retention policy.
- [ ] Provide a read-only command to inspect the update journal.
- [ ] Provide an operator command to activate the previous verified release.
- [ ] Provide database restore instructions for restore-required migrations.
- [ ] Document how to clear a stale update lock safely.
- [ ] Keep manual recovery possible when the web interface is unavailable.
- [ ] Add a release smoke checklist for AIMANA Asparagus before channel publication.

## Documentation Deliverables

- [ ] Development-to-distribution release guide
- [ ] Versioning and channel policy
- [ ] Release manifest schema reference
- [ ] Artifact contents and protected paths reference
- [ ] Owner update interface guide
- [ ] Windows service/update-helper guide
- [ ] Rollback and disaster-recovery guide
- [ ] Release signing and key-rotation procedure
- [ ] Maintainer release checklist
- [ ] CI/CD workflow, GitHub App, branch-protection, environment, and repository-settings guide

## Recommended Implementation Order

1. Add complete development and distribution CI plus protected-branch rules.
2. Normalize repository differences and define the release artifact contract.
3. Implement build identity, SemVer comparison, and manifest validation.
4. Implement controlled GitHub App promotion into AIMANA Asparagus.
5. Build, attest, publish, and smoke-test immutable GitHub Release artifacts behind protected environments.
6. Implement the command-line updater with backup, staging, health check, and rollback.
7. Validate the updater against a disposable clone of AIMANA Asparagus.
8. Add the authenticated remote update API and operation journal.
9. Connect the owner interface to the proven command-line/helper workflow.
10. Add external restart handling, signature enforcement, threat-model validation, and stable-channel gates.

Do not begin with the interface installation button. The command-line and external-helper path must be safe, recoverable, and tested first; the interface should orchestrate that same updater rather than implement a second update mechanism.

## Definition Of Done

- [ ] A tested development commit can be promoted to one immutable AIMANA Asparagus release without manual source copying.
- [ ] Every release has a unique SemVer version, build identity, manifest, checksum, release notes, and reproducible provenance.
- [ ] A production installation can check for an official compatible update without changing state.
- [ ] The installation owner can approve an update through the interface after reauthentication.
- [ ] The updater preserves secrets, database contents, uploads, extensions, and operator configuration.
- [ ] Failed or interrupted updates leave the previous version runnable or automatically roll back.
- [ ] The updater never accepts an arbitrary download source or unverified artifact.
- [ ] Version checks use semantic ordering and cannot mistake a downgrade for an update.
- [ ] Update progress and final status survive the application restart.
- [ ] Command-line recovery remains available if the interface or new release cannot start.

## Out Of Scope For The First Release

- unattended automatic installation
- bandwidth-optimized delta/binary patch artifacts; the first release may use a complete verified application artifact while still preserving all installation data in place
- peer-to-peer release delivery
- arbitrary third-party update feeds
- owner-supplied scripts executed during installation
- updating the Node.js runtime itself
- operating-system package and service-manager upgrades
- hot-swapping server code without restart
