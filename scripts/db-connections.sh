#!/usr/bin/env bash
# One-shot: client connections Postgres has open right now vs its limit.
OUT=$(kubectl -n chat exec postgres-0 -- psql -U chat -tAc \
  "SELECT count(*) FILTER (WHERE backend_type='client backend') || ' / ' || current_setting('max_connections')
   FROM pg_stat_activity" 2>&1) \
  && echo "$OUT" || echo "FULL - even the admin cannot connect (too many clients)"
