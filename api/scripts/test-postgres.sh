#!/usr/bin/env bash
#
# Roda a suíte no PostgreSQL — o motor de PRODUÇÃO.
#
# Por que isto existe (2026-09-27): a suíte roda em SQLite por padrão
# (`phpunit.xml`), e o SQLite é o motor que a produção NÃO usa. Ele é
# mais permissivo em exatamente os pontos onde o P4 mora:
#
#   - `client_key` é `varchar` no SQLite e `uuid` NATIVO no Postgres, então
#     uma chave malformada passava no SQLite e virava erro de SQL no
#     Postgres;
#   - FK é apenas metadado no SQLite, e é donde sai o `ON DELETE SET NULL`
#     que impede apagar histórico de saúde;
#   - `timestamp` eFunctions de data têm semântica própria em cada motor.
#
# Resultado: uma suíte pode estar 100% verde no SQLite e o deploy
# quebrar. Foi o que aconteceu — 8 testes que usavam `'aaaa-1111'` como
# `client_key` só estouraram aqui.
#
# Uso:
#   ./scripts/test-postgres.sh              # suíte inteira
#   ./scripts/test-postgres.sh --filter P4  # só os testes do P4
#
# Sai com código != 0 se qualquer teste falhar, então serve de gate em CI.

set -euo pipefail

cd "$(dirname "$0")/.."

NET="assidua_pg_test"
PG_CONTAINER="assidua_pg_test"
PG_IMAGE="postgres:16-alpine"
PHP_IMAGE="assidua_php_pg"
PG_DB="assidua_test"
PG_USER="postgres"
PG_PASS="test"

cleanup() {
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: docker é necessário para este script." >&2
  echo "Alternativa: suba um Postgres e rode" >&2
  echo "  DB_CONNECTION=pgsql DB_HOST=... ./vendor/bin/phpunit" >&2
  exit 1
fi

echo "→ banco no ar"
docker network create "$NET" >/dev/null 2>&1 || true
docker run -d --rm --name "$PG_CONTAINER" --network "$NET" --network-alias pg \
  -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB="$PG_DB" -e POSTGRES_USER="$PG_USER" \
  "$PG_IMAGE" >/dev/null

# O Postgres precisa de alguns segundos para aceitar conexão.esperar de
# verdade é melhor que `sleep` chumbado: se a máquina estiver carregada,
# 5s não bastam e o primeiro comando falha com mensagem confusa.
for i in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 30 ] && { echo "ERRO: Postgres não ficou pronto." >&2; exit 1; }
  sleep 1
done

# A imagem do Sail não tem `pdo_pgsql`, e é ela que roda a suíte no dia a
# dia. Então o script sobe a sua — mesma receita de `pdo_pgsql`, sem
# `pdo_sqlite` (que o PHPUnit não precisa aqui).
if ! docker image inspect "$PHP_IMAGE" >/dev/null 2>&1; then
  echo "→ construindo a imagem PHP com pdo_pgsql (só na primeira vez)"
  docker build -q -t "$PHP_IMAGE" - <<'DOCKERFILE' >/dev/null
FROM php:8.4-cli
RUN apt-get update -qq && apt-get install -y -qq libpq-dev git unzip libzip-dev >/dev/null \
 && docker-php-ext-install pdo_pgsql pcntl >/dev/null \
 && pecl install redis >/dev/null && docker-php-ext-enable redis >/dev/null
WORKDIR /opt
DOCKERFILE
fi

echo "→ suíte no PostgreSQL (produção)"
docker run --rm --network "$NET" \
  -v "$(pwd)":/opt -w /opt \
  -e DB_CONNECTION=pgsql -e DB_HOST=pg -e DB_PORT=5432 \
  -e DB_DATABASE="$PG_DB" -e DB_USERNAME="$PG_USER" -e DB_PASSWORD="$PG_PASS" \
  "$PHP_IMAGE" ./vendor/bin/phpunit "$@"
