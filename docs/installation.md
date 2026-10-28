# AIMANA Installation Instructions

[← Back to Documentation Index](./README.md)

This guide explains the first-run installer at `#/install`. Use it for a clean installation or to migrate data from another AIMANA instance.

For a parameter-by-parameter description of the root `.env` settings, see the [Environment Variable Reference](./environment.md).

## Before you begin

- Install and start a compatible AIMANA build. For source setup and launch commands, see the repository [README](../README.md).
- Have the destination runtime configuration ready. `AUTH_SECRET` is required for safe authentication; AI, Google identity, Drive, and search-provider keys are optional unless you use those features.
- Keep the destination `.env` settings. A Full Baseline does not copy runtime secrets from the source server.
- If migrating, prepare one **Full Baseline ZIP** from the source instance. The installer accepts a ZIP up to **1 GB** and does not accept Incremental ZIPs or raw `.db` files.

## Clean installation

1. Open the installer. It appears automatically while the instance is not ready; the direct route is `#/install`.
2. Read **Environment Review** and resolve any blocking errors.
3. Complete **Instance Settings** and select **Save Installer Config**.
4. In **Runtime Secrets & Integrations**, provide an `AUTH_SECRET`. Add optional provider values only for features you plan to use. Save the runtime config.
5. Complete **Initial Admin**. The password must be at least 10 characters, and the confirmation must match.
6. Review the required checklist. Select **Finalize Installation** when the button is enabled.
7. Review the **Post-Install Summary**, then continue to sign in with the new admin account.

## Migration during installation

1. On the source instance, open **System Operations**, unlock it with the Super Admin password, and download a **Full Baseline** ZIP. Check `BACKUP_REPORT.json`; proceed only when `summary.status` is `complete`.
2. On the destination's first-run installer, save **Instance Settings**.
3. Select the ZIP in **Migrate from a Full Baseline** and choose **Restore Full Baseline**.
4. Review the **Migration Report** and resolve any warnings. The backup supplies the admin account, so do not create another one.
5. Configure and save the destination's required `AUTH_SECRET` and any destination-specific integrations, then complete the required checklist and finalize. Sign in with a source account after migration.

Migration replaces the destination database and uploads. Use a fresh destination without an administrator or workspace data. The migration clears old login sessions, so users must sign in again. For offline restore or backup chains with Incrementals, see the [Manual Migration Guide](./migration.md).

After migration, the **Root admin created** checklist item is satisfied by the imported account. The **Admin created** timestamp under **Install Progress** may still say **Not completed** because it records the destination's initial-admin form action; that timestamp alone does not block finalization.

## Installer forms and controls

| Form or section | Fields and controls | What it does |
| --- | --- | --- |
| **Instance Settings** | **Instance Name** (required); **Install Mode** (`Local First`, `Creative Lab`, or `Team Pilot`); **Notes** (optional); **Save Installer Config** | Records the destination's display name, setup profile, and operator notes. Save this before finalizing a clean install. |
| **Migrate from a Full Baseline** (shown only on a fresh destination) | **Full Baseline ZIP** file picker; **Restore Full Baseline** button | Imports the database and uploaded files from one Full Baseline ZIP up to 1 GB. It also imports source accounts. It replaces destination database and uploads, and does not import `.env` secrets or Incremental backups. |
| **Initial Admin** (shown when no admin exists) | **Admin Name**; **Admin Email**; **Create Password**; **Confirm Password**; **Create Initial Admin** | Creates the first `admin-root` account. Use a valid email and a password of at least 10 characters. Skip this form after migration because the backup supplies the accounts. |
| **Runtime Secrets & Integrations — Core Security** | **Auth Secret** (`AUTH_SECRET`, required) | Signs AIMANA session and verification tokens. Set a strong, unique secret for the destination. |
| **Runtime Secrets & Integrations — AI Providers** | **Google AI Key** (`API_KEY`); **Pollinations App Key** (`POLLINATIONS_APP_KEY`); **Pollinations Key** (`POLLINATIONS_API_KEY`); **AirForce Key** (`AIRFORCE_API_KEY`) — optional | Enables the corresponding AI providers and authorization flows. Add only the providers you intend to use. |
| **Runtime Secrets & Integrations — Identity & Drive** | **Google Client ID** (`GOOGLE_CLIENT_ID`); **Google Browser API Key** (`GOOGLE_API_KEY`) — optional | Enables Google sign-in and Google Drive features when configured with the matching Google project. |
| **Runtime Secrets & Integrations — Fallback Search** | **Fallback Search Provider** (`none`, `tavily`, or `searxng`); **Tavily API Key** (`TAVILY_API_KEY`); **SearXNG URL** (`CHAT_WEB_SEARCH_SEARXNG_URL`) — optional | Configures server-side fallback search. Tavily requires its API key; SearXNG requires its base URL. |
| **Runtime Secrets & Integrations actions** | **Save Runtime Config**; **Generate New AUTH_SECRET**; **Restore Current Defaults** | Saves non-empty runtime values to the destination `.env`; generates and saves a new auth secret; or resets the on-screen values to the currently loaded configuration. Generating a new secret requires users to sign in again. |
| **Finalize** | **Finalize Installation** button | Records completion after the instance settings, admin account, required runtime configuration, and blocking environment checks are complete. |
| **Migration Report** (after a successful import) | Source filename and version; restored database-row and file counts; restore warnings | Summarizes what the installer restored. Review warnings before switching users to the destination. |
| **Read-only panels** | **Environment Review**, **Required Checklist**, **Install Progress**, **Post-Install Summary** | Show blockers and warnings, completion state, timestamps, the admin account, storage paths, enabled integrations, and recommended hardening steps. They do not submit configuration. |

## Troubleshooting

- **Migration is unavailable:** the destination already has an administrator, workspace data, or a completed install. Use a fresh destination for installer migration.
- **The ZIP is rejected:** confirm it is a Full Baseline ZIP and is no larger than 1 GB. Incremental ZIPs and raw database files are not accepted here.
- **The installer still needs finalization after migration:** review the checklist and Environment Review. The destination may still need its own `AUTH_SECRET` or instance settings.
- **Assets are missing:** inspect `BACKUP_REPORT.json`. A database restore without the matching `uploads/` files can leave asset records pointing to files that are not present.

---

[← Back to Documentation Index](./README.md)
