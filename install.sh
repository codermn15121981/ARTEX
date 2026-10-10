#!/usr/bin/env bash
# Скрипт установки ARTEX: ① полностью в Docker  ② локальная компиляция и запуск
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

info(){ printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok(){   printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[!]\033[0m %s\n' "$*"; }
die(){  printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){  local p="$1" d="${2:-}" a; read -rp "$p${d:+ [$d]}: " a; echo "${a:-$d}"; }
rand(){ head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24; }

# ── обнаружение / автоустановка docker ───────────────────
ensure_docker(){
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "docker и docker compose обнаружены"; return
  fi
  warn "docker / docker compose не обнаружены"
  case "$(uname -s)" in
    Linux)
      if [ "$(ask 'Установить Docker автоматически? (y/n)' y)" = y ]; then
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker "$USER" || true
        ok "Docker установлен (для работы без sudo нужно перелогиниться — изменение группы вступит в силу)"
      else
        die "Установите docker самостоятельно и повторите попытку"
      fi ;;
    Darwin) die "На macOS установите Docker Desktop: https://www.docker.com/products/docker-desktop/" ;;
    *)      die "Установите docker самостоятельно и повторите попытку" ;;
  esac
}

# ── определение архитектуры для dist/<arch>/artex, который ожидает Dockerfile ──
docker_target_arch(){
  case "$(uname -m)" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "Неподдерживаемая архитектура для Docker-сборки: $(uname -m)" ;;
  esac
}

# Этот форк (перевод интерфейса на русский) не публикует готовый образ в Docker
# Hub — вместо того, чтобы скачать оригинальный (непереведённый) образ автора
# проекта, собираем бинарник и образ локально из исходного кода этого форка.
build_docker_binary(){
  command -v npm >/dev/null 2>&1 || die "npm не найден (нужен для сборки фронтенда)"
  command -v go  >/dev/null 2>&1 || die "Go не найден (нужна версия >=1.26): https://go.dev/dl/"
  local arch; arch="$(docker_target_arch)"
  info "Сборка статических файлов фронтенда…"
  ( cd web && npm ci && npm run build:static )
  rm -rf server/webui/dist && cp -r web/out server/webui/dist
  info "Компиляция бинарника для linux/${arch}…"
  mkdir -p "dist/${arch}"
  CGO_ENABLED=0 GOOS=linux GOARCH="${arch}" go build -tags embedui -trimpath -o "dist/${arch}/artex" ./cmd/artex
  ok "Бинарник собран → dist/${arch}/artex"
}

# ── ① полностью в Docker ───────────────────────────────
install_docker(){
  ensure_docker
  if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    local pw key
    pw="$(ask 'Пароль Postgres (Enter — сгенерировать случайный)' "$(rand)")"
    key="$(ask 'ANTHROPIC_API_KEY (можно оставить пустым и задать позже в UI)' '')"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pw}|" .env
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${key}|" .env
    rm -f .env.bak
    ok ".env создан (POSTGRES_PASSWORD установлен)"
  else
    info "Используется уже существующий .env"
  fi
  build_docker_binary
  info "Сборка образа и запуск…"
  docker compose build artex
  docker compose up -d
  ok "Запуск завершён → http://localhost:8787"
  info "Логи: docker compose logs -f artex"
}

# ── ② локальная компиляция и запуск ──────────────────────────────
install_local(){
  echo "Способ установки базы данных:"
  echo "  1) Подключиться к существующему PostgreSQL"
  echo "  2) Поднять PostgreSQL через Docker (нужен docker)"
  case "$(ask 'Выбор' 1)" in
    2)
      ensure_docker
      local pw; pw="$(ask 'Пароль Postgres (Enter — случайный)' "$(rand)")"
      docker run -d --name artex-pg -p 5432:5432 \
        -e POSTGRES_USER=artex -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=artex \
        -v artex-pg:/var/lib/postgresql/data postgres:16-alpine
      DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=artex DB_PASS="$pw" DB_NAME=artex DB_SSL=disable ;;
    *)
      DB_HOST="$(ask 'Адрес базы данных' 127.0.0.1)"
      DB_PORT="$(ask 'Порт' 5432)"
      DB_USER="$(ask 'Пользователь' artex)"
      DB_PASS="$(ask 'Пароль' '')"
      DB_NAME="$(ask 'Имя базы данных' artex)"
      DB_SSL="$(ask 'sslmode (disable/require)' disable)" ;;
  esac

  # генерация config.json
  cat > config.json <<JSON
{
  "database": {
    "host": "${DB_HOST}",
    "port": ${DB_PORT},
    "user": "${DB_USER}",
    "password": "${DB_PASS}",
    "dbname": "${DB_NAME}",
    "sslmode": "${DB_SSL}"
  }
}
JSON
  ok "config.json создан"

  # проверка Go
  command -v go >/dev/null 2>&1 || die "Go не найден, установите Go (>=1.26): https://go.dev/dl/"
  ok "Go: $(go version)"

  # для встроенного фронтенда нужен node для статической сборки
  if command -v npm >/dev/null 2>&1; then
    info "Сборка статических файлов фронтенда…"
    ( cd web && npm ci && npm run build:static )
    rm -rf server/webui/dist && cp -r web/out server/webui/dist
    info "Компиляция единого бинарника со встроенным фронтендом…"
    CGO_ENABLED=0 go build -tags embedui -trimpath -o artex ./cmd/artex
  else
    warn "npm не найден: будет собран бэкенд **без встроенного фронтенда** (фронтенд нужно запускать отдельно через npm run dev)"
    CGO_ENABLED=0 go build -o artex ./cmd/artex
  fi
  ok "Сборка завершена → ./artex"

  info "Запуск… (Ctrl-C для выхода)"
  ./artex
}

echo "=============================="
echo "  Установка ARTEX"
echo "  1) Полностью в Docker"
echo "  2) Локальный запуск (сборка через go)"
echo "=============================="
case "$(ask 'Выбор' 1)" in
  1) install_docker ;;
  2) install_local ;;
  *) die "Неверный выбор" ;;
esac
