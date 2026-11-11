#!/usr/bin/env bash
# Rebuilds the LOCAL test database from supabase/migrations.
# Uses TEST_DATABASE_URL (default: the local Supabase container on port 54322).
set -euo pipefail
URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
case "$URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to reset a non-local database: $URL" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/.."
PGOPTIONS="-c capsule.allow_reset=on -c storage.allow_delete_query=true -c client_min_messages=warning" psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/reset.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -q -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done
echo "Local database rebuilt from $(ls supabase/migrations/*.sql | wc -l) migrations."
