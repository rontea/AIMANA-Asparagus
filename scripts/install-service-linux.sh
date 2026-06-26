#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-aimana}"
APP_ROOT="${APP_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RUN_USER="${RUN_USER:-$USER}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
APP_PORT="${APP_PORT:-3001}"
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/${SERVICE_NAME}.service}"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node was not found in PATH" >&2
  exit 1
fi

cat <<UNIT | sudo tee "${UNIT_PATH}" >/dev/null
[Unit]
Description=AIMANA Service
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_ROOT}
Environment=PORT=${APP_PORT}
ExecStart=${NODE_BIN} index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
echo "Created ${UNIT_PATH}"
echo "Start the service with: sudo systemctl start ${SERVICE_NAME}"
