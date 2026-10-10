#!/usr/bin/env bash
# Скрипт обновления ARTEX: ① обновление через Docker (пересборка образа из исходного кода)
#                            ② локальное обновление (пересборка бинарника)
# Соответствует install.sh: install отвечает за первый запуск, update — за переход на новую версию.
# Миграции БД выполнять вручную не нужно — artex при каждом запуске идемпотентно
# повторно прогоняет schema.sql (включая ADD COLUMN/CREATE INDEX IF NOT EXISTS),
# то есть «перезапуск = миграция». Данные (том pgdata, ./data, ./skills) не затрагиваются.
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

info(){ printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok(){   printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[!]\033[0m %s\n' "$*"; }
die(){  printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){  local p="$1" d="${2:-}" a; read -rp "$p${d:+ [$d]}: " a; echo "${a:-$d}"; }

docker_target_arch(){
  case "$(uname -m)" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "Неподдерживаемая архитектура для Docker-сборки: $(uname -m)" ;;
  esac
}

# ── опционально: синхронизация репозитория с последней версией кода (обновляет compose/скрипты/исходники для локальной сборки) ───────
sync_repo(){
  [ -d .git ] && command -v git >/dev/null 2>&1 || { warn "это не рабочая копия git, git pull пропущен"; return; }
  [ "$(ask 'Получить последний код (git pull --ff-only)? (y/n)' y)" = y ] || return
  if ! git pull --ff-only; then
    warn "git pull не удалось выполнить как fast-forward (есть локальные изменения или ветка разошлась) — разберитесь вручную и повторите попытку; в этот раз используется текущий код"
  fi
}

# Этот форк (перевод интерфейса на русский) не публикует готовый образ в Docker
# Hub — вместо того, чтобы скачать оригинальный (непереведённый) образ автора
# проекта, пересобираем бинарник и образ локально из исходного кода этого форка.
build_docker_binary(){
  command -v npm >/dev/null 2>&1 || die "npm не найден (нужен для сборки фронтенда)"
  command -v go  >/dev/null 2>&1 || die "Go не найден (нужна версия >=1.26): https://go.dev/dl/"
  local arch; arch="$(docker_target_arch)"
  info "Пересборка статических файлов фронтенда…"
  ( cd web && npm ci && npm run build:static )
  rm -rf server/webui/dist && cp -r web/out server/webui/dist
  info "Компиляция бинарника для linux/${arch}…"
  mkdir -p "dist/${arch}"
  CGO_ENABLED=0 GOOS=linux GOARCH="${arch}" go build -tags embedui -trimpath -o "dist/${arch}/artex" ./cmd/artex
  ok "Бинарник собран → dist/${arch}/artex"
}

# ── ① обновление через Docker ───────────────────────────────
update_docker(){
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 \
    || die "docker / docker compose не обнаружены, сначала выполните установку через ./install.sh"
  [ -f .env ] || die ".env не найден, сначала выполните первичное развёртывание через ./install.sh"

  build_docker_binary

  # имя локального образа задаётся через ARTEX_TAG в .env (по умолчанию local);
  # опционально можно задать другое имя тега для этой пересборки
  local tag; tag="$(ask 'Тег образа (Enter — оставить значение из .env / local)' '')"
  if [ -n "$tag" ]; then
    if grep -q '^ARTEX_TAG=' .env; then
      sed -i.bak "s|^ARTEX_TAG=.*|ARTEX_TAG=${tag}|" .env && rm -f .env.bak
    else
      printf '\nARTEX_TAG=%s\n' "$tag" >> .env
    fi
    ok "ARTEX_TAG установлен в ${tag}"
  fi

  # пересобираем только artex: postgres зафиксирован на 16-alpine, обновлять его не
  # нужно (это лишняя трата трафика, да и крупные изменения версии несут риск
  # несовместимости). artex объявляет depends_on postgres, поэтому при запуске с
  # именем сервиса pg будет поднят автоматически, если не запущен, а уже
  # работающий — оставлен как есть, без пересборки.
  info "Пересборка образа (только artex)…"
  docker compose build artex
  info "Пересоздание и запуск (schema мигрируется автоматически при перезапуске artex)…"
  docker compose up -d artex
  ok "Обновление завершено → http://localhost:8787"
  info "Логи: docker compose logs -f artex"
  info "Очистка старых образов (опционально): docker image prune -f"
}

# ── ② локальное обновление ──────────────────────────────
update_local(){
  command -v go >/dev/null 2>&1 || die "Go не найден (нужна версия >=1.26): https://go.dev/dl/"
  [ -f config.json ] || warn "config.json не найден — если это первое развёртывание, используйте ./install.sh"
  ok "Go: $(go version)"

  if command -v npm >/dev/null 2>&1; then
    info "Пересборка статических файлов фронтенда…"
    ( cd web && npm ci && npm run build:static )
    rm -rf server/webui/dist && cp -r web/out server/webui/dist
    info "Повторная компиляция единого бинарника со встроенным фронтендом…"
    CGO_ENABLED=0 go build -tags embedui -trimpath -o artex ./cmd/artex
  else
    warn "npm не найден: собирается бэкенд **без встроенного фронтенда** (фронтенд нужно запускать отдельно через npm run dev)"
    CGO_ENABLED=0 go build -o artex ./cmd/artex
  fi
  ok "Сборка завершена → ./artex"
  warn "Перезапустите работающий процесс artex, чтобы изменения вступили в силу (при перезапуске schema мигрируется автоматически)"
}

echo "=============================="
echo "  Обновление ARTEX"
echo "  1) Обновление через Docker (пересборка образа)"
echo "  2) Локальное обновление (пересборка через go)"
echo "=============================="
case "$(ask 'Выбор' 1)" in
  1) sync_repo; update_docker ;;
  2) sync_repo; update_local ;;
  *) die "Неверный выбор" ;;
esac
