#!/usr/bin/env bash
# =============================================================================
# Скрипт сброса пароля администратора ARTEX
#
# Имя пользователя для входа всегда ARTEX; пароль хранится в виде bcrypt-хэша
# в ключе auth.password_hash таблицы settings базы данных. Этот скрипт
# подключается к базе и с помощью pgcrypto генерирует bcrypt-хэш прямо в базе,
# записывая его в этот ключ — полностью совместимо с проверкой входа на
# бэкенде (golang.org/x/crypto/bcrypt).
#
# Два варианта развёртывания:
#   local (по умолчанию) — подключение к базе через psql напрямую с хоста.
#                    Данные подключения берутся в таком порядке приоритета:
#                    аргументы командной строки > --dsn/$ARTEX_PG_DSN > database.* из config.json
#   docker        — выполнение psql внутри контейнера postgres через
#                    `docker compose exec` (или `docker exec`); по умолчанию
#                    compose не публикует порт 5432 на хост, поэтому только так.
#
# Примеры использования:
#   ./reset-password.sh                          # локально, автоматически читает config.json/окружение, пароль вводится интерактивно
#   ./reset-password.sh -p 'NewPass!'            # локально, пароль передан явно
#   ./reset-password.sh --dsn postgres://u:p@h:5432/artex
#   ./reset-password.sh -H 127.0.0.1 -P 5433 -U autopentest -W pass -d artex
#   ./reset-password.sh -m docker                # развёртывание в docker (читает POSTGRES_* из .env)
#   ./reset-password.sh -m docker -c имя_контейнера_pg --exec docker
#
# Безопасность: новый пароль передаётся через переменную окружения + psql
# \getenv (не попадает в argv процесса) и автоматически экранируется через
# :'var' (защита от SQL-инъекций); пароль базы данных передаётся через
# PGPASSWORD, тоже минуя argv.
# =============================================================================
set -euo pipefail

PASS_KEY="auth.password_hash"
BCRYPT_COST=10

MODE=""            # local | docker (пусто=автоопределение)
DSN=""
HOST="" PORT="" USER="" DBPASS="" DBNAME="" SSLMODE=""
CONFIG=""
CONTAINER=""       # имя сервиса/контейнера postgres в режиме docker (по умолчанию postgres)
EXEC_KIND=""       # compose | docker (какой exec использовать в режиме docker; пусто=автоопределение)
NEWPASS=""
ASSUME_YES=0

die() { echo "Ошибка: $*" >&2; exit 1; }
info() { echo "· $*" >&2; }

usage() { sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ---- Разбор аргументов -------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)        MODE="${2:-}"; shift 2 ;;
    --dsn)            DSN="${2:-}"; shift 2 ;;
    -H|--host)        HOST="${2:-}"; shift 2 ;;
    -P|--port)        PORT="${2:-}"; shift 2 ;;
    -U|--user)        USER="${2:-}"; shift 2 ;;
    -W|--db-password) DBPASS="${2:-}"; shift 2 ;;
    -d|--dbname)      DBNAME="${2:-}"; shift 2 ;;
    --sslmode)        SSLMODE="${2:-}"; shift 2 ;;
    --config)         CONFIG="${2:-}"; shift 2 ;;
    -c|--container)   CONTAINER="${2:-}"; shift 2 ;;
    --exec)           EXEC_KIND="${2:-}"; shift 2 ;;
    -p|--new-password) NEWPASS="${2:-}"; shift 2 ;;
    -y|--yes)         ASSUME_YES=1; shift ;;
    -h|--help)        usage ;;
    *) die "Неизвестный параметр: $1 (см. -h для справки)" ;;
  esac
done

# ---- Читаем database.* из config.json (только в режиме local и если подключение не задано явно) -----
# Предпочитаем парсинг через python3 (надёжнее); если python3 нет — откат на grep (config.json с аккуратными отдельными полями).
read_config_json() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$path" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1])).get("database", {})
except Exception:
    sys.exit(1)
# Поддерживается либо прямой dsn, либо отдельные поля
if d.get("dsn"):
    print("DSN\t" + d["dsn"]); sys.exit(0)
for k in ("host","port","user","password","dbname","sslmode"):
    if d.get(k) is not None:
        print(k.upper() + "\t" + str(d[k]))
PY
  else
    # Минимальный запасной вариант: grep по каждому ключу (значение — строка или число)
    local k
    for k in host port user password dbname sslmode; do
      local v
      v=$(grep -oE "\"$k\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|[0-9]+)" "$path" 2>/dev/null \
            | head -1 | sed -E "s/.*:[[:space:]]*//; s/^\"//; s/\"$//") || true
      [[ -n "$v" ]] && echo -e "${k^^}\t$v"
    done
  fi
}

apply_config_fields() {
  local line key val
  while IFS=$'\t' read -r key val; do
    [[ -z "$key" ]] && continue
    case "$key" in
      DSN)      [[ -z "$DSN" ]] && DSN="$val" ;;
      HOST)     [[ -z "$HOST" ]] && HOST="$val" ;;
      PORT)     [[ -z "$PORT" ]] && PORT="$val" ;;
      USER)     [[ -z "$USER" ]] && USER="$val" ;;
      PASSWORD) [[ -z "$DBPASS" ]] && DBPASS="$val" ;;
      DBNAME)   [[ -z "$DBNAME" ]] && DBNAME="$val" ;;
      SSLMODE)  [[ -z "$SSLMODE" ]] && SSLMODE="$val" ;;
    esac
  done
}

# ---- Автоопределение режима ---------------------------------------------------------
if [[ -z "$MODE" ]]; then
  if [[ -n "$DSN$HOST$USER$DBNAME" || -n "${ARTEX_PG_DSN:-}" || -f "${CONFIG:-config.json}" ]]; then
    MODE="local"
  elif command -v docker >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
    MODE="docker"
  else
    MODE="local"
  fi
fi
info "Режим развёртывания: $MODE"

# ---- Получение нового пароля -----------------------------------------------------------
if [[ -z "$NEWPASS" ]]; then
  read -r -s -p "Введите новый пароль (имя пользователя всегда ARTEX): " NEWPASS; echo >&2
  [[ -n "$NEWPASS" ]] || die "Пароль не может быть пустым"
  read -r -s -p "Повторите для подтверждения: " NEWPASS2; echo >&2
  [[ "$NEWPASS" == "$NEWPASS2" ]] || die "Введённые пароли не совпадают"
fi
[[ -n "$NEWPASS" ]] || die "Пароль не может быть пустым"

# Передаём пароль в psql через переменную окружения (\getenv читает её, не попадает в argv/ps)
export ARTEX_RESET_NEWPASS="$NEWPASS"

# Генерируем bcrypt прямо в базе и делаем upsert; пароль автоматически
# экранируется через :'newpw'. CREATE EXTENSION идемпотентна, если у роли БД
# нет прав на создание расширений — здесь будет ошибка (см. подсказку в ветке
# обработки сбоя run ниже).
SQL=$(cat <<SQL
\\set ON_ERROR_STOP on
\\getenv newpw ARTEX_RESET_NEWPASS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO settings(key, value)
VALUES ('$PASS_KEY', crypt(:'newpw', gen_salt('bf', $BCRYPT_COST)))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
SQL
)

# ---- Выполнение -----------------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
  # Приоритет данных подключения: командная строка > --dsn/$ARTEX_PG_DSN > config.json
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    [[ -n "${ARTEX_PG_DSN:-}" ]] && DSN="$ARTEX_PG_DSN"
  fi
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    cfg="${CONFIG:-config.json}"
    if [[ -f "$cfg" ]]; then
      info "Читаем конфигурацию базы данных из $cfg"
      apply_config_fields < <(read_config_json "$cfg")
    fi
  fi

  command -v psql >/dev/null 2>&1 || die "psql не найден на этой машине (установите postgresql-client либо используйте -m docker)"

  declare -a PSQL_ARGS=()
  if [[ -n "$DSN" ]]; then
    PSQL_ARGS=("$DSN")
    target="$DSN"
  else
    [[ -n "$USER"   ]] || die "Не указан пользователь базы данных (-U) и нет корректного config.json/DSN"
    [[ -n "$DBNAME" ]] || die "Не указано имя базы данных (-d) и нет корректного config.json/DSN"
    HOST="${HOST:-127.0.0.1}"; PORT="${PORT:-5432}"; SSLMODE="${SSLMODE:-disable}"
    PSQL_ARGS=(-h "$HOST" -p "$PORT" -U "$USER" -d "$DBNAME")
    [[ -n "$SSLMODE" ]] && export PGSSLMODE="$SSLMODE"
    [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
    target="$USER@$HOST:$PORT/$DBNAME"
  fi

  info "Целевая база данных: $target"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Подтвердите сброс пароля ARTEX в этой базе? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Отменено"
  fi

  if ! printf '%s\n' "$SQL" | psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q >/dev/null; then
    die "Запись не удалась. Если ошибка связана с правами/отсутствием pgcrypto, используйте роль с правом создания расширений либо выполните CREATE EXTENSION pgcrypto вручную."
  fi

else
  # ---- docker ----
  command -v docker >/dev/null 2>&1 || die "docker не найден"
  CONTAINER="${CONTAINER:-postgres}"

  # Выбор способа exec: сначала docker compose exec (по имени сервиса), иначе docker exec (по имени контейнера)
  if [[ -z "$EXEC_KIND" ]]; then
    if docker compose version >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
      EXEC_KIND="compose"
    else
      EXEC_KIND="docker"
    fi
  fi

  # Учётные данные psql внутри контейнера: сначала командная строка, затем POSTGRES_* из .env, иначе значения compose по умолчанию (artex)
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; . ./.env; set +a
  fi
  DUSER="${USER:-${POSTGRES_USER:-artex}}"
  DNAME="${DBNAME:-${POSTGRES_DB:-artex}}"
  [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
  [[ -z "${PGPASSWORD:-}" && -n "${POSTGRES_PASSWORD:-}" ]] && export PGPASSWORD="$POSTGRES_PASSWORD"

  info "Цель: psql -U $DUSER -d $DNAME внутри контейнера $CONTAINER (exec=$EXEC_KIND)"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Подтвердите сброс пароля ARTEX в базе этого контейнера? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Отменено"
  fi

  # -e только с именем без значения → значение наследуется из текущего окружения, пароль не попадает в argv команды docker.
  declare -a EXEC_CMD
  if [[ "$EXEC_KIND" == "compose" ]]; then
    EXEC_CMD=(docker compose exec -T -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  else
    EXEC_CMD=(docker exec -i -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  fi

  if ! printf '%s\n' "$SQL" | "${EXEC_CMD[@]}" >/dev/null; then
    die "Запись не удалась. Проверьте имя контейнера (-c), учётные данные базы (POSTGRES_* в .env) и наличие у роли прав на pgcrypto."
  fi
fi

unset ARTEX_RESET_NEWPASS
echo "✓ Пароль администратора ARTEX сброшен. Войдите с именем пользователя ARTEX и новым паролем (перезапуск сервиса не требуется)."
