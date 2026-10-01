#!/bin/sh
set -e

if [ ! -f "$DB_PATH" ]; then
  echo "No existing database at $DB_PATH — seeding..."
  mkdir -p "$(dirname "$DB_PATH")"
  node_modules/.bin/tsx packages/server/src/db/seed.ts
fi

exec node_modules/.bin/tsx packages/server/src/index.ts
