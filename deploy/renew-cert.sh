#!/bin/sh
set -e
cd "$(dirname "$0")/.."
sudo docker compose run --rm certbot renew --webroot -w /var/www/certbot
sudo docker compose exec web nginx -s reload
