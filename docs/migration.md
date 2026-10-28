# AIMANA Manual Migration Guide

[← Back to Documentation Index](./README.md)

This guide moves an AIMANA workspace to a new server. Keep the source installation and its backup until the destination has been checked and accepted.

## Choose a migration method

Use the installer migration when the Full Baseline ZIP is **1 GB or smaller**. It restores the database and uploaded files and displays a migration report.

Use the offline method below when you need to restore the database snapshot and uploaded files directly, including when the ZIP is too large for the installer upload. The destination application must be stopped while its files are replaced.

## Create and check a Full Baseline

1. On the source AIMANA instance, open **System Operations** and unlock it with the Super Admin password.
2. Run **Create Full Baseline** and download the ZIP.
3. Check `BACKUP_REPORT.json` in the ZIP. Continue only if `summary.status` is `complete`. Resolve missing files or other warnings, then create a new Full Baseline.
4. For a precise cutover, prevent edits on the source while the final backup is being created. The installer migration accepts a Full Baseline only; it does not apply Incremental backups.

The Full Baseline ZIP contains `aimana_production_snapshot.db`, `SYSTEM_MANIFEST.json`, `BACKUP_REPORT.json`, and an `uploads/` directory when files were captured.

## Recommended: migrate during installation

1. Install and start the compatible AIMANA build on the destination.
2. Keep the destination on the first-run installer. Do not create an administrator or workspace data first.
3. In **Migrate from a Full Baseline**, select the downloaded Full Baseline ZIP and choose **Restore Full Baseline**.
4. Review the Migration Report. Resolve any warnings before switching users to the destination.
5. Configure the destination's runtime secrets and integrations. The backup does not replace the destination `.env` file.
6. Sign in with an account from the source installation. Existing sessions are cleared, so sign in again with the account credentials.

The installer upload accepts one Full Baseline ZIP up to 1 GB. It does not accept an Incremental ZIP or a raw `.db` file.

## Offline restore from a Full Baseline ZIP

Use this procedure on the destination server when restoring the snapshot directly.

1. Stop AIMANA completely and confirm its Node process has exited. Do not replace a database while AIMANA is running.
2. Back up the destination's entire `storage/` directory. If present, include `aimana.db-wal` and `aimana.db-shm` with the database backup.
3. Extract the Full Baseline ZIP to a temporary staging directory using an archive tool that supports Zip64.
4. In the destination `storage/` directory, rename the existing `aimana.db` to a dated backup name. Also rename any existing `aimana.db-wal` and `aimana.db-shm` files so they cannot be reused with the restored database.
5. Copy `aimana_production_snapshot.db` from the staging directory to the destination as `storage/aimana.db`.
6. Move the contents of the archive's `uploads/` directory into `storage/uploads/`, preserving all subdirectories and relative paths. Do not create `storage/uploads/uploads/`.
7. Keep the destination `.env` file. Add or update the destination's authentication, AI, and identity-provider settings there as needed; do not assume the Full Baseline contains runtime secrets.
8. Start AIMANA. Let startup complete its database schema and extension migrations before signing in.
9. Sign in with a source account, verify projects and representative asset files, and review `BACKUP_REPORT.json` for any capture warnings.
10. Keep both the original source and the destination's pre-migration storage backup until validation is complete.

The database snapshot restores metadata. The matching `uploads/` tree restores local binaries such as previews and downloadable files. Restoring the database without those files can leave asset records pointing to missing files.

## Restore a Full Baseline plus Incrementals

The installer migration does not apply Incremental backups. To replay a backup chain, first complete a destination setup with an administrator, then use **System Operations → Automated Restore** to upload the Full Baseline and every Incremental ZIP created after it. The restore checks their time ranges and baseline IDs. Each ZIP is subject to the 1 GB per-file upload limit, and the restore accepts up to 12 ZIPs in one run.

## If something goes wrong

- If the installer reports that migration is unavailable, the destination already has an administrator, workspace data, or a completed installation. Use a clean destination for installer migration.
- If upload fails, confirm the selected file is a Full Baseline ZIP and is no larger than 1 GB.
- If the migration report lists warnings or the source `BACKUP_REPORT.json` is partial, create a new Full Baseline after correcting the listed missing files.
- If an offline restore will not start, stop AIMANA and restore the destination's saved `storage/` backup, including the database sidecar files if they were present.
- Backups contain user and workspace data. Store and transfer them through a trusted, access-controlled location.

---

[← Back to Documentation Index](./README.md)

