# syntax=docker/dockerfile:1
#
# Рантайм-образ (компиляция не внутри образа): устанавливает только нужные
# инструменты и копирует **заранее собранный Linux-бинарник**. Бинарник
# ожидается в dist/<TARGETARCH>/artex контекста сборки.
#
# Этот форк (перевод интерфейса на русский) не публикует готовый образ в
# Docker Hub — docker-compose.yml собирает образ локально через этот
# Dockerfile. Собрать бинарник вручную перед `docker compose build`:
#   cd web && npm run build:static && cd ..
#   cp -r web/out server/webui/dist
#   CGO_ENABLED=0 GOARCH=amd64 go build -tags embedui -o dist/amd64/artex ./cmd/artex
#   docker build -t artex:local .
# (install.sh / update.sh делают это автоматически.)
FROM python:3.12-slim-bookworm
ARG TARGETARCH
# Часто используемые инструменты: ripgrep / curl / vim, плюс стандартный набор для recon (меняйте по необходимости).
# Node ставится из NodeSource 20.x: штатный apt nodejs в bookworm — версии 18, а Playwright требует >=20.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates ripgrep curl wget vim git jq unzip \
      dnsutils iputils-ping netcat-openbsd inetutils-telnet whois nmap \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
# Предустановка Playwright MCP и CLI (глобально), чтобы во время работы не тянуть их через npx из сети.
# @playwright/mcp: browser MCP запускается прямо `npx @playwright/mcp` (уже установлен глобально, -y/@latest не нужны).
# @playwright/cli: даёт playwright-cli, сразу после установки проверяем --help, что бинарник работает.
# Далее ставим playwright (управление браузерами) и через --with-deps сразу подготавливаем chromium
# с системными зависимостями, чтобы MCP/CLI в контейнере были готовы к работе с первого запуска,
# без скачивания браузера из сети.
RUN npm install -g @playwright/mcp@latest @playwright/cli@latest playwright@latest \
    && playwright-cli --help \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Заранее собранный бинарник нужной архитектуры (dist/amd64/artex или dist/arm64/artex)
COPY dist/${TARGETARCH}/artex /app/artex
# Скрипт-супервизор запуска: решает, перезапускать ли процесс, по его коду
# выхода; через него работает замена бинарника при обновлении в один клик на
# странице. Он же пересылает SIGTERM в artex — docker stop отправляет сигнал
# только PID 1, и без этой пересылки artex его не получит и не сможет
# корректно завершиться, а через 10 секунд будет убит SIGKILL.
COPY start.sh /app/start.sh
RUN chmod +x /app/artex /app/start.sh
COPY skills/ /app/skills/
# Точка постоянного хранения data/ (SQLite + jwt.key)
VOLUME ["/app/data"]
EXPOSE 8787 8788
ENTRYPOINT ["/app/start.sh"]
CMD ["-addr", ":8787", "-proxy", ":8788"]
