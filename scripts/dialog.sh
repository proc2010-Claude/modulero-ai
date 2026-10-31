#!/usr/bin/env bash
# Стенд диалога на Node 24 одной командой из любого нового шелла: включает Node 24 через nvm (ставит, если его
# нет), ставит зависимости, если их нет, и запускает npm run dialog с теми же аргументами.
#   scripts/dialog.sh ready <сеанс> --out /mnt/project-files
#   scripts/dialog.sh turn - <<'EOF' … EOF
set -e
cd "$(dirname "$0")/.."
if [ "$(node -v 2>/dev/null | cut -d. -f1)" != "v24" ]; then
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  # --no-use: без него nvm.sh в свежем контейнере (нет алиаса default и установленных версий) возвращает 3,
  # и set -e молча обрывал скрипт до nvm install.
  if ! . "$NVM_DIR/nvm.sh" --no-use >/dev/null; then
    echo "dialog.sh: не загрузился nvm из $NVM_DIR/nvm.sh" >&2; exit 1
  fi
  nvm use 24 >/dev/null 2>&1 || nvm install 24 >/dev/null || {
    echo "dialog.sh: не удалось поставить Node 24 через nvm (nvm install 24)" >&2; exit 1
  }
  if [ "$(node -v 2>/dev/null | cut -d. -f1)" != "v24" ]; then
    echo "dialog.sh: после nvm нужен Node 24, а сейчас $(node -v 2>/dev/null || echo 'node не найден')" >&2; exit 1
  fi
fi
[ -d node_modules ] || npm ci --silent >/dev/null
exec npm run -s dialog -- "$@"
