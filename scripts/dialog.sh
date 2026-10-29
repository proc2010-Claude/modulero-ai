#!/usr/bin/env bash
# Стенд диалога на Node 24 одной командой из любого нового шелла: включает Node 24 через nvm (ставит, если его
# нет), ставит зависимости, если их нет, и запускает npm run dialog с теми же аргументами.
#   scripts/dialog.sh ready <сеанс> --out /mnt/project-files
#   scripts/dialog.sh turn --session <сеанс> - <<'EOF' … EOF
set -e
cd "$(dirname "$0")/.."
die() {
  echo "dialog.sh: $*" >&2
  exit 1
}
if [ "$(node -v 2>/dev/null | cut -d. -f1)" != "v24" ]; then
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] || die "нет Node 24 и нет nvm в $NVM_DIR: поставьте Node 24 (.nvmrc) или задайте NVM_DIR."
  # nvm.sh возвращает 3, если у nvm нет алиаса default (свежий контейнер): под set -e шелл молча вышел бы с кодом 0.
  set +e
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 24 >/dev/null 2>&1 || nvm install 24 >/dev/null 2>&1
  set -e
  [ "$(node -v 2>/dev/null | cut -d. -f1)" = "v24" ] || die "не удалось включить Node 24 через nvm (nvm install 24): сейчас $(node -v 2>/dev/null || echo 'node нет')."
fi
[ -d node_modules ] || npm ci --silent >/dev/null || die "npm ci не прошёл."
exec npm run -s dialog -- "$@"
