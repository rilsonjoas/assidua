#!/bin/sh
set -e

# Cache de config/rotas (em produção as vars de env já estão disponíveis)
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Migrations automáticas no deploy
php artisan migrate --force

# Inicia nginx + php-fpm via supervisord
exec supervisord -c /etc/supervisord.conf
