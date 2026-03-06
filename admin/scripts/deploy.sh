#!/bin/bash
set -euo pipefail

# ── Admin Dashboard Deploy Script ──────────────────────────────────────────
# Builds the admin SPA and deploys to admin.cartaraiq.app via SSH.
#
# Usage:  ./scripts/deploy.sh
# ───────────────────────────────────────────────────────────────────────────

SSH_HOST="tcai"
REMOTE_DIR="/home/tradecom/admin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADMIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "══════════════════════════════════════════"
echo "  CartaraIQ Admin — Deploy"
echo "══════════════════════════════════════════"

# 1. Build
echo ""
echo "→ Building production bundle..."
cd "$ADMIN_DIR"
npm run build

echo ""
echo "→ Build complete: $(du -sh dist | cut -f1) total"

# 2. Upload
echo ""
echo "→ Deploying to $SSH_HOST:$REMOTE_DIR ..."
rsync -avz --delete \
  --exclude='.DS_Store' \
  dist/ "$SSH_HOST:$REMOTE_DIR/"

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Deployed to admin.cartaraiq.app"
echo "══════════════════════════════════════════"
