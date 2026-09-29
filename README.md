# Kridens Alias

Своя игра в Alias с балансировкой сложности слов. Подробности механики — в [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Структура

- `packages/core` — игровое ядро (сборка дек, правила хода), общее для клиента и сервера.
- `packages/server` — WebSocket-сервер комнат + SQLite-словарь.
- `packages/client` — веб-клиент (Vite + React).

## Запуск

```bash
npm install
cp packages/server/.env.example packages/server/.env
npm run seed --workspace=@kridens/server   # заливает сид-словарь в SQLite
npm run dev                        # поднимает сервер и клиент вместе
```

Клиент — http://localhost:5173, сервер — http://localhost:8787.
