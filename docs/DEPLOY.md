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

## 7. HTTPS (после привязки домена)

Пока сервер доступен только по IP, TLS не настроен. Когда появится домен, направленный на сервер:

```bash
apt install certbot python3-certbot-nginx -y
```

Либо проще — поднять certbot как отдельный шаг на хосте (не в контейнере `web`, так как nginx там живёт внутри контейнера): временно открыть порт 80 наружу (уже открыт), получить сертификат через `certbot --nginx` на системный nginx-реверс-прокси перед контейнерами, либо добавить certbot-контейнер с общим volume для сертификатов и webroot. Это отдельный шаг, который имеет смысл делать только когда известен домен.
