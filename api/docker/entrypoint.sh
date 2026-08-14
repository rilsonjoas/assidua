#!/bin/sh
set -e

# Cache de config/rotas (em produção as vars de env já estão disponíveis)
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Migrations automáticas no deploy
php artisan migrate --force

# Symlink public/storage -> storage/app/public (idempotente: se já existe,
# o comando só avisa e retorna 0, não quebra o set -e). Necessário pra
# servir as fotos de medicamento; storage/app/public é volume persistente,
# mas o symlink em si fica dentro da imagem e some a cada rebuild.
php artisan storage:link

# Inicia nginx + php-fpm via supervisord
exec supervisord -c /etc/supervisord.conf
