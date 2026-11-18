#!/usr/bin/env bash
# Runs migrations + RLS/security tests against a throwaway local Postgres (16+) database.
# Requires: psql, and a running Postgres reachable via PGHOST/PGPORT/PGUSER (superuser).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${RLS_TEST_DB:-datalab_rls_test}
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/supabase-shim.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null; done
out=$(psql -q -d "$DB" -f supabase/tests/rls_security.test.sql -A -t 2>&1 | grep -E '^(PASS|FAIL)\||^[0-9]+\|[0-9]+$|ERROR' || true)
echo "$out" | grep -E '^FAIL|ERROR' || true
summary=$(echo "$out" | tail -1)
echo "RLS tests passed|failed: $summary"
[[ "$summary" =~ \|0$ ]] || exit 1
