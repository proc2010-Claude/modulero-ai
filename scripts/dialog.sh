#!/usr/bin/env bash
# Стенд диалога на Node 24 одной командой из любого нового шелла: включает Node 24 через nvm (ставит, если его
# нет), ставит зависимости, если их нет, и запускает npm run dialog с теми же аргументами.
#   scripts/dialog.sh ready <сеанс> --out /mnt/project-files
#   scripts/dialog.sh turn - <<'EOF' … EOF
set -e
cd "$(dirname "$0")/.."
if [ "$(node -v 2>/dev/null | cut -d. -f1)" != "v24" ]; then
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  . "$NVM_DIR/nvm.sh" >/dev/null
  nvm use 24 >/dev/null 2>&1 || nvm install 24 >/dev/null
fi
[ -d node_modules ] || npm ci --silent >/dev/null
exec npm run -s dialog -- "$@"
