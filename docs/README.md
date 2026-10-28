# AIMANA Asparagus Documentation

Welcome to the **AIMANA Asparagus** documentation hub. This index serves as the central directory for user guides, operational runbooks, architecture specifications, and release notes.

---

## 📑 Table of Contents

### 🚀 Operations & Deployment
| Document | Target Audience | Description |
| :--- | :--- | :--- |
| **[Manual Migration Guide](./migration.md)** | Administrators / Operators | Moving workspaces to new servers via installer baseline restore or offline snapshot restore. |
| **[Installation Instructions](./installation.md)** | Administrators | First-run setup, installer migration, and a table describing each installer form and control. |
| **[Environment Variable Reference](./environment.md)** | Administrators / Developers | Descriptions of each variable currently present in the root `.env`, grouped by feature. |
| **[Getting Started & Installation](../README.md#how-to-run-the-application)** | All Users | Node.js prerequisites, setup commands, environment variables, and initial application launch. |

### 📦 Release Notes & Changelogs
| Document | Focus | Description |
| :--- | :--- | :--- |
| **[Public Changelog](../CHANGELOG.md)** | Users & Developers | Feature additions, visual interface improvements, and commit reference logs adhering to Keep a Changelog. |
| **[Internal Technical Changelog](../CHANGELOG_INTERNAL.md)** | Core Developers | Architectural changes, schema migrations, API contracts, security boundaries, and test validation logs. |

### 🧠 Architecture & Engineering Specifications
| Document | Area | Description |
| :--- | :--- | :--- |
| **[Checkpoint Hub Sync](../internal.docs/checkpoint-hub.md)** | AI Model Registries | Multi-lane provider synchronization mechanics, catalog reconciliation, and stale model pruning rules. |
| **[CI/CD Release Architecture](../internal.todo/plan_cicd.md)** | DevOps / Tooling | Deployment pipelines, private-to-public promotion workflows, and release automation plans. |
| **[Application Update System](../internal.todo/todo-owner-application-update-system-2026-07-21.md)** | Platform Operations | Pull-based update system architecture and local instance patch mechanisms. |

---

## 🧭 Navigation & Common Tasks

### Moving an existing instance to a new server
Follow the **[Manual Migration Guide](./migration.md)**:
1. Generate a **Full Baseline ZIP** from *System Operations*.
2. Verify `BACKUP_REPORT.json` status is `complete`.
3. Restore directly during the first-run installation on the destination server (up to 1 GB), or use the offline snapshot replacement procedure.

### Installing a new instance
Follow the [Installation Instructions](./installation.md) for the setup order and installer-form reference.

### Staying up to date with new versions
- Review the **[Public Changelog](../CHANGELOG.md)** before pulling updates.
- Check the **[Internal Changelog](../CHANGELOG_INTERNAL.md)** if you are developing custom extensions or modifying backend APIs.

---

[← Return to Repository README](../README.md)

