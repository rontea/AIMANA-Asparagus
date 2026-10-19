# AIMANA CI/CD Plan

Date: `2026-07-21`
Status: `proposed`
Owner: `platform`

Related plan: [Owner Application Update And Release System](./todo-owner-application-update-system-2026-07-21.md)

## Objective

Create an end-to-end release pipeline that validates AIMANA development changes, promotes approved code into AIMANA Asparagus, publishes a verified official release, and lets an existing AIMANA installation update through the current **Settings -> Client Update -> Manual Release Control** section without manually downloading files or migrating data.

CI/CD is pull-based at the installed application boundary. GitHub Actions publishes official releases; installed AIMANA instances check for and install those releases. GitHub Actions must not connect directly to customer computers.

## Repository Roles

### Development repository

- Local workspace: `C:\Projects\aimana`
- Repository: `https://github.com/rontea/AIMANA.git`
- Primary branch: `main`
- Responsibilities:
  - development
  - pull-request validation
  - automated tests
  - release preparation
  - controlled export/promotion into AIMANA Asparagus

### Distribution repository

- Local production workspace: `C:\Projects\AIMANA-Asparagus`
- Repository: `https://github.com/rontea/AIMANA-Asparagus.git`
- Beta branch: `beta`
- Stable branch: `main`
- Responsibilities:
  - distribution-specific review
  - beta and stable release validation
  - immutable GitHub Releases
  - official update artifacts and manifests
  - release notes and checksums

## End-To-End Flow

```text
AIMANA development main
    -> pull request CI
    -> merge after required checks
    -> prepare explicit version
    -> controlled promotion PR
    -> AIMANA-Asparagus beta or main
    -> distribution CI
    -> owner-approved release workflow
    -> immutable artifact, manifest, checksum, and attestation
    -> GitHub Release
    -> installed AIMANA checks official release channel
    -> owner approves in Settings
    -> backup, download, verify, stage, activate, restart
    -> health check
    -> success or automatic rollback
```

## Current Gaps

- The current development workflow only validates extensions.
- The distribution workflow watches `main`, while active production development currently uses `beta`.
- There is no complete build and test workflow.
- There is no automated promotion between the two repositories.
- AIMANA Asparagus had no published GitHub Releases when reviewed on `2026-07-21`.
- There is no release artifact builder or manifest generator.
- There is no artifact signing/attestation policy.
- There is no external update helper, update journal, health-check activation, or rollback test.
- The existing interface only compares the browser build to the already-installed server version and reloads the page.

## CI Stage 1: Development Validation

Create:

```text
.github/workflows/ci.yml
```

Triggers:

- every pull request targeting `main`
- every push to `main`
- optional manual `workflow_dispatch` for investigation

Required jobs:

1. Checkout the exact commit.
2. Install the supported Node.js version.
3. Restore the npm download cache keyed by `package-lock.json`.
4. Install dependencies with `npm ci`.
5. Run TypeScript and production build validation.
6. Run frontend tests.
7. Run server tests.
8. Run extension validation.
9. Run installer smoke validation.
10. Upload useful logs/results on failure.

Required commands:

```bash
npm ci
npm run build
npm test
npm run test:server
npm run validate:extensions
npm run test:install-smoke
```

Runner policy:

- Run the normal validation suite on Ubuntu for speed.
- Run updater, installer, filesystem, process-restart, and SQLite-native tests on Windows because AIMANA Asparagus is currently operated on Windows.
- Add a full Windows matrix only where platform behavior is material.

Security policy:

- Default workflow token permissions to read-only.
- Do not expose release credentials to pull-request jobs.
- Pin third-party actions to reviewed versions or full commit SHAs according to repository policy.
- Do not run privileged release jobs for pull requests from forks.
- Treat caches as performance aids only; always reconstruct dependencies with `npm ci`.

## Branch Protection

Protect development `main` and distribution `beta`/`main`.

Recommended requirements:

- changes enter through pull requests
- required CI status checks pass
- branch is up to date before merge
- conversations are resolved
- force pushes and branch deletion are disabled
- at least one approval for release-critical changes
- the most recent reviewable push must be approved where practical
- release workflow and updater changes receive explicit security review

References:

- [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## CI Stage 2: Release Preparation

Add release tooling in the development repository:

```text
scripts/release/
  prepare-release.mjs
  build-artifact.mjs
  generate-manifest.mjs
  verify-artifact.mjs
  export-distribution.mjs
  protected-paths.json
```

Add package scripts similar to:

```json
{
  "scripts": {
    "release:prepare": "node scripts/release/prepare-release.mjs",
    "release:build": "node scripts/release/build-artifact.mjs",
    "release:verify": "node scripts/release/verify-artifact.mjs",
    "release:export": "node scripts/release/export-distribution.mjs"
  }
}
```

Example preparation command:

```powershell
npm run release:prepare -- --version 1.0.2 --channel beta
```

Release preparation must:

- require an explicit SemVer version
- reject an existing/reused version
- require a clean Git working tree
- confirm the commit belongs to the expected protected branch
- update root `package.json` and root version entries in `package-lock.json`
- generate release notes from an explicit changelog/release input
- run the complete CI suite
- build `dist/`
- embed version, channel, source commit, and build timestamp
- create an allowlisted staging directory
- scan the staging directory for protected paths and secrets
- generate an immutable artifact
- generate SHA-256 checksums
- generate `update-manifest.json`
- install the artifact into a disposable directory
- run a clean-install smoke test against the artifact
- run an update simulation from the preceding supported release

## Release Artifact Contract

The artifact contains replaceable application code only.

Include:

- server runtime code
- frontend production assets in `dist/`
- required runtime application files
- extension runtime packages and templates required by the release
- `package.json`
- committed `package-lock.json`
- database migration definitions
- version/build metadata
- license and required notices

Exclude:

- `.git/`
- `.env` and `.env.local`
- `storage/`
- SQLite databases
- uploads
- `node_modules/`
- backups
- `.tmp/`
- `.codex-logs/`
- local service logs
- developer credentials
- machine-specific configuration
- investigation and temporary files

Expected outputs:

```text
aimana-1.0.2.zip
update-manifest.json
SHA256SUMS
release-notes.md
```

## CD Stage 1: Promote Into AIMANA Asparagus

Create in the development repository:

```text
.github/workflows/promote-asparagus.yml
```

Trigger:

- manual `workflow_dispatch` after development CI succeeds

Inputs:

- version
- target channel: `beta` or `stable`
- source commit
- release notes or release-notes path

Promotion flow:

1. Validate the requested source commit and version.
2. Confirm all required CI jobs passed for the commit.
3. Generate an allowlisted distribution export.
4. Authenticate to `rontea/AIMANA-Asparagus` through a narrowly scoped GitHub App.
5. Create a destination branch such as `release/1.0.2`.
6. Commit the exported release source and metadata.
7. Open a pull request:
   - into `beta` for beta releases
   - into `main` for stable releases
8. Include source commit, version, channel, test run, change summary, and artifact plan in the pull request.
9. Do not publish a release until distribution CI and review pass.

Do not manually copy the development directory into production. The export allowlist must preserve intentional AIMANA Asparagus branding/license/channel files and must never include local data or secrets.

## Cross-Repository Authentication

The built-in `GITHUB_TOKEN` is scoped to its workflow repository and should not be used as if it can write to a second repository. Use a dedicated GitHub App for automated promotion.

Recommended GitHub App permissions:

- AIMANA:
  - metadata: read
  - contents: read
- AIMANA Asparagus:
  - metadata: read
  - contents: write
  - pull requests: write

Store credentials as protected environment secrets:

- GitHub App ID
- GitHub App private key
- installation/owner metadata if required by the token action

Never store these values in `.env`, workflow YAML, source files, release archives, or repository variables visible to untrusted jobs.

References:

- [GitHub Actions authentication](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)
- [GitHub App authentication in Actions](https://docs.github.com/en/enterprise-cloud%40latest/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)

## CI Stage 3: Distribution Validation

Create or replace in AIMANA Asparagus:

```text
.github/workflows/ci.yml
```

Triggers:

- pull requests into `beta`
- pull requests into `main`
- pushes to `beta`
- pushes to `main`

The distribution workflow repeats the complete development suite because the distribution repository is the source that users ultimately trust.

Additional distribution checks:

- distribution version equals the release request
- package and lockfile root versions agree
- build identity contains the promoted development commit
- artifact contains no protected paths
- artifact checksum is reproducible for the workflow inputs
- clean installation succeeds
- previous supported release updates successfully
- `.env`, database, uploads, accounts, projects, prompts, and settings survive the simulated update
- downgrade attempts are rejected
- equal version with a different build identity is rejected

## CD Stage 2: Publish GitHub Release

Create in AIMANA Asparagus:

```text
.github/workflows/release.yml
```

Recommended trigger:

- manual `workflow_dispatch`
- optionally a protected version tag after the manual process is proven

Inputs:

- version
- channel
- target commit
- release-notes path or text

GitHub Environments:

- `beta-release`
- `stable-release`

Environment protections:

- owner/reviewer approval
- only the matching protected branch can deploy
- release secrets are scoped to the environment
- stable releases cannot be published directly from `beta`
- concurrency prevents two releases for the same channel from publishing together

After approval, the workflow must:

1. Re-run release validation.
2. Confirm the version/tag/release does not already exist.
3. Build the artifact exactly once for publication.
4. Generate the manifest and checksums from the published bytes.
5. Generate provenance attestation and optional SBOM.
6. Create a protected tag:
   - `v1.0.2` for stable
   - `v1.2.0-beta.1` for beta
7. Create the GitHub Release.
8. Mark beta releases as prereleases.
9. Upload artifact, manifest, checksums, release notes, and verification metadata.
10. Verify the uploaded asset digest through the GitHub API.
11. Record the published release URL and digest in the workflow summary.

Required publishing permissions should be limited to the publishing job:

```yaml
permissions:
  contents: write
  id-token: write
  attestations: write
```

References:

- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases?apiVersion=latest)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations)

## Version And Channel Policy

Examples:

```text
1.0.0              initial stable release
1.0.1              stable bug fix
1.0.2              later stable bug fix
1.1.0              backward-compatible feature release
1.2.0-beta.1       first beta for a feature release
1.2.0-beta.2       later beta
1.2.0              promoted stable release
2.0.0              explicitly incompatible major release
```

Channel behavior:

- `stable` installations receive stable releases only.
- `beta` installations receive later beta releases and compatible stable promotion releases.
- `development` builds are never published to customer update channels.
- A lower version is never offered as an update.
- Equal version with a different artifact/build identity is treated as a release integrity failure.
- Every published version maps to one immutable artifact checksum.

## Installed Application Release Check

The server checks the official public release source. The browser must not fetch and interpret release packages directly.

Release-check flow:

1. Query official AIMANA Asparagus releases.
2. Cache successful responses and respect GitHub rate limits/ETags.
3. Filter by the installation's configured channel.
4. Download only the candidate manifest.
5. Validate manifest schema and trusted origin.
6. Compare installed and available versions with SemVer.
7. Validate minimum Node.js, application, and database requirements.
8. Return safe presentation metadata to the Settings interface.

The Settings section displays:

- installed version and build identity
- selected update channel
- latest compatible version
- publication date
- release notes
- artifact size
- restart and migration requirements
- compatibility or error state
- Check for Updates
- Install Update

## In-App Deployment Boundary

GitHub Actions ends after publishing the official release. The installed application performs local deployment.

After owner approval and reauthentication:

1. Create a durable update operation record.
2. Start an external update helper.
3. Acquire an exclusive update lock.
4. Run preflight checks.
5. Create a SQLite-safe database backup.
6. Preserve installation configuration.
7. Download into an isolated staging directory.
8. Verify SHA-256 and signature/attestation policy.
9. Validate archive paths and extraction limits.
10. Install locked dependencies with `npm ci` if needed.
11. Validate the staged release.
12. Stop the running service gracefully.
13. Activate the staged release.
14. Run database migrations under the release policy.
15. Restart AIMANA.
16. Poll the health endpoint.
17. Confirm the running build identity equals the requested release.
18. Mark success and reconnect the browser.
19. Restore the previous release automatically if activation or health checking fails.

## Persistent And Replaceable State

Persistent installation-owned state:

```text
.env
storage/
database
uploads
extension host configuration
installation identity
update channel
operator service configuration
backups
```

Replaceable release-owned state:

```text
server runtime code
frontend dist
application source/runtime modules
package.json
package-lock.json
migration definitions
release metadata
```

The normal owner update flow must not require GitHub access through a browser, ZIP handling, copying files, Git commands, npm commands, reinstalling AIMANA, exporting/importing data, or manually running migrations.

## Required Release And Update Tests

### CI tests

- clean dependency installation
- production build
- frontend tests
- server tests
- extension tests
- installer smoke test
- release artifact validation
- secret/protected-path scan

### Upgrade tests

- previous stable to patch
- previous stable to minor
- beta to later beta
- beta to stable promotion
- database migration required
- no migration required
- update with large SQLite database
- upload preservation
- configuration preservation
- interrupted download
- checksum/signature failure
- dependency installation failure
- migration failure
- startup failure
- health-check timeout
- successful rollback
- stale update-lock recovery
- downgrade rejection
- unauthorized update request rejection

### Windows tests

- process restart
- locked files
- path-length and archive-path behavior
- external helper activation
- service-manager restart
- atomic or recoverable directory switching
- rollback after the parent Node process exits

## GitHub Configuration Checklist

### AIMANA

- [ ] Enable GitHub Actions.
- [ ] Add protected `main` rules.
- [ ] Require full CI status checks.
- [ ] Create a promotion environment.
- [ ] Configure required reviewer approval for promotion.
- [ ] Install the cross-repository GitHub App.
- [ ] Store App credentials as environment secrets.
- [ ] Restrict default `GITHUB_TOKEN` to read-only.

### AIMANA Asparagus

- [ ] Push and protect `beta`.
- [ ] Protect stable `main`.
- [ ] Update CI triggers to cover both branches.
- [ ] Create `beta-release` environment.
- [ ] Create `stable-release` environment.
- [ ] Configure required release reviewers.
- [ ] Prevent stable publication from non-stable branches.
- [ ] Grant release job only the required write permissions.
- [ ] Enable artifact attestations where supported.
- [ ] Define release retention and immutability policy.

## Implementation Order

### Milestone 1: Reliable CI

- [ ] Add complete development CI.
- [ ] Add complete distribution CI.
- [ ] Add branch protection and required checks.
- [ ] Make current tests reliable on clean runners.

### Milestone 2: Reproducible Release Artifact

- [ ] Implement build identity.
- [ ] Implement release preparation.
- [ ] Implement protected-path allowlist/exclusions.
- [ ] Implement manifest and checksum generation.
- [ ] Implement clean artifact smoke installation.

### Milestone 3: Controlled Cross-Repository Promotion

- [ ] Create and install the GitHub App.
- [ ] Implement the promotion workflow.
- [ ] Generate AIMANA Asparagus release pull requests.
- [ ] Preserve intentional distribution-only files.

### Milestone 4: Official GitHub Releases

- [ ] Implement protected release environments.
- [ ] Implement beta release publication.
- [ ] Add attestations and uploaded digest verification.
- [ ] Validate beta artifacts manually.
- [ ] Implement stable promotion.

### Milestone 5: Safe Local Updater

- [ ] Implement CLI update check.
- [ ] Implement CLI installation, journal, staging, and rollback.
- [ ] Implement Windows external helper and restart.
- [ ] Add previous-release upgrade fixtures and tests.

### Milestone 6: Existing Settings Integration

- [ ] Replace the server/client version mismatch check with official release discovery.
- [ ] Preserve a separate stale-browser Reload Client action.
- [ ] Connect Install Update to the proven updater operation.
- [ ] Require owner reauthentication.
- [ ] Display durable progress and reconnect after restart.

### Milestone 7: Hardening

- [ ] Add signed-manifest verification policy.
- [ ] Add SBOM and dependency policy.
- [ ] Threat-model release hosting and updater compromise.
- [ ] Test recovery from interruption at every mutating step.
- [ ] Pilot beta updates before enabling stable releases.

## Definition Of Done

- A pull request cannot enter development `main` without required tests.
- A tested development commit can be promoted to AIMANA Asparagus without manually copying source files.
- Distribution code is validated independently before publication.
- A release requires explicit approval through a protected GitHub Environment.
- Every published version has one immutable artifact, manifest, checksum, source commit, and provenance record.
- An installed AIMANA instance can discover only official compatible releases for its channel.
- The owner can update entirely through the existing Settings update section.
- Existing secrets, database, uploads, accounts, projects, prompts, and settings remain available without export/import or manual migration.
- Failed or interrupted updates leave the preceding version runnable or roll it back automatically.
- Manual command-line recovery remains available when the web application cannot start.
