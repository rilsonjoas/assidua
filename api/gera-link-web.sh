#!/usr/bin/env bash
# Gera um link de acesso mágico pro ambiente LOCAL (web) e imprime na
# tela. O e-mail local usa MAIL_MAILER=log, então o "envio" vira uma
# linha no laravel.log — este script extrai o link mais recente.
#
# Uso:
#   ./gera-link-web.sh                                  # seu e-mail padrão, origem localhost:8081
#   ./gera-link-web.sh outro@email.com                  # outra conta (cria na hora se passar -n)
#   ./gera-link-web.sh rilsonjoas10@gmail.com http://192.168.18.4:8081
#
# Link vale 15 minutos e é de uso único.

set -euo pipefail

cd "$(dirname "$0")"

EMAIL="${1:-rilsonjoas10@gmail.com}"
ORIGIN="${2:-http://localhost:8081}"

curl -s -X POST "http://100.85.29.100/api/auth/magic-link" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"redirect_origin\":\"${ORIGIN}\"}" > /dev/null

sleep 1

LINK=$(docker compose exec -T laravel.test sh -c \
  "grep -o 'http[^\\\" ]*magic-link/redirect[^\\\" ]*' storage/logs/laravel.log | tail -1" \
  2>/dev/null | sed 's/&amp;/\&/g' | tr -d '\r\n')

if [ -z "${LINK}" ]; then
  echo "Falhou: nenhum link encontrado no log (Sail rodando? e-mail existe?)." >&2
  exit 1
fi

echo ""
echo "🔗 Link de acesso (${ORIGIN}):"
echo "${LINK}"
echo ""
