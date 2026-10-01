# Деплой на hoster.by

Приложение — один WebSocket+HTTP Node-процесс (комнаты, SQLite-словарь) и статический React-клиент.
Деплоится как два Docker-контейнера через `docker compose`: `server` (Node) и `web` (nginx, отдаёт клиент и проксирует `/api` и `/ws` на `server`).

## 1. Создание облачного сервера

На https://hoster.by/service/cloud/hosting/ создать «Облачный сервер»:

- **1 vCPU / 1 ГБ RAM / 15 ГБ NVMe или SSD**, Ubuntu 24.04 LTS.
- Для небольшой игры этого достаточно на старте. Ресурсы можно увеличить позже без пересоздания сервера.

## 2. Базовая настройка сервера

```bash
ssh root@<ip-сервера>

adduser deploy
usermod -aG sudo deploy

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# опционально: отключить root-логин по SSH после проверки доступа под deploy
```

## 3. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Перелогиниться как `deploy`, проверить: `docker compose version`.

## 4. Деплой приложения

```bash
git clone <url-репозитория> kridens-alias
cd kridens-alias

cp .env.production.example .env
# заполнить ADMIN_USERNAME и ADMIN_PASSWORD в .env

docker compose up -d --build
```

Первый запуск сам засеет словарь (seed), если база ещё не создана. При последующих деплоях (`docker compose up -d --build` на обновлённый код) база сохраняется в volume `words-data` и не перезаписывается.

## 5. Проверка

- Открыть `http://<ip-сервера>/` — должен загрузиться клиент.
- Создать комнату в одной вкладке, подключиться к ней в другой — проверить, что состояние синхронизируется (WebSocket работает через nginx-прокси `/ws`).
- Открыть `/admin`, авторизоваться учётными данными из `.env`.

## 6. Обновление после изменений в коде

```bash
cd kridens-alias
git pull
docker compose up -d --build
```

## 7. HTTPS

TLS настроен через контейнер `certbot/certbot` (webroot-метод) и volume `letsencrypt`, который `web` монтирует read-only в `/etc/letsencrypt`. Нужен домен, указывающий на IP сервера (A-запись), **до** выпуска сертификата.

Первый выпуск сертификата (домен уже должен резолвиться на сервер):

```bash
cd kridens-alias
docker compose up -d --build web   # поднимает nginx с открытым /.well-known/acme-challenge/
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d <домен> --email <email> --agree-tos --non-interactive
```

После этого `deploy/nginx.conf` уже содержит финальный конфиг (80 → редирект на 443 + сам 443-сервер с `ssl_certificate`/`ssl_certificate_key` на `<домен>`) — если домен другой, поменять `server_name` и пути `ssl_certificate*` в `deploy/nginx.conf`, затем:

```bash
docker compose up -d --build web
```

### Автопродление

Сертификат Let's Encrypt живёт 90 дней. `deploy/renew-cert.sh` вызывает `certbot renew` и перезагружает nginx (no-op, если продление не требуется). Настроено через cron на хосте:

```bash
sudo crontab -e
# добавить строку:
17 3 * * 1 /home/deploy/kridens-alias/renew-cert.sh >> /home/deploy/renew-cert.log 2>&1
```
