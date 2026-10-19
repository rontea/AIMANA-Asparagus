# Checkpoint Hub

The Checkpoint Hub is the admin-facing registry workspace for AI engines.

## Access

- route: `/checkpoints`
- visible to `admin` and `admin-root`

## What It Manages

- entries in `custom_engines`
- provider-backed system engines
- forged custom engines
- tested vs untested registry status

## Current Sync Actions

The UI can sync registry data from:

- Google models
- Pollinations text models
- Pollinations image models
- Pollinations audio models
- Pollinations video models

The **Renew All Lanes** action runs these syncs sequentially. Each provider sync refreshes current engine mappings and removes stale provider-managed entries before the Hub reloads the registry. User-forged engines are not part of this cleanup. The renewal summary reports per-lane counts and any provider failures.

## Registry Views

- public registry data comes from `GET /api/settings/registry`
- admin details come from `GET /api/settings/registry/admin`

## Editing Flow

Opening a registry entry launches the Configure Intelligence modal described in the related docs.
