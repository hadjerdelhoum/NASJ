#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL for development (skip this if you already run Postgres or use Supabase).
#   scripts/dev-db.sh start|stop|status
# Creates role/database "nasj" (password "nasj") to match backend/.env.example.
set -euo pipefail

PGDATA="${NASJ_PGDATA:-$HOME/.nasj-pgdata}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || BIN="$(dirname "$(command -v pg_ctl)")"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then  # postgres refuses to run as root
  id claude >/dev/null 2>&1 && RUN_AS=(runuser -u claude --)
  mkdir -p "$PGDATA"; chown claude:claude "$PGDATA" 2>/dev/null || true
fi

case "${1:-start}" in
  start)
    [ -f "$PGDATA/PG_VERSION" ] || "${RUN_AS[@]}" "$BIN/initdb" -D "$PGDATA" -A trust -U postgres >/dev/null
    "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/log.txt" -o "-p 5432 -k /tmp" start -w >/dev/null || true
    psql -h localhost -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='nasj') THEN CREATE ROLE nasj LOGIN PASSWORD 'nasj' SUPERUSER; END IF;
END $$;
SQL
    psql -h localhost -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='nasj'" | grep -q 1 \
      || psql -h localhost -U postgres -qc "CREATE DATABASE nasj OWNER nasj"
    echo "postgres://nasj:nasj@localhost:5432/nasj ready"
    ;;
  stop)   "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$PGDATA" stop -m fast ;;
  status) pg_isready -h localhost -p 5432 ;;
esac
