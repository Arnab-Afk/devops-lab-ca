#!/usr/bin/env bash
# Live dashboard for the demo: HPA, pods, and how many connections Postgres has open.
# Usage: scripts/demo-watch.sh   (run in its own terminal while k6 is running)
NS=chat
while true; do
  clear
  date '+%H:%M:%S'
  echo "== HPA"; kubectl -n $NS get hpa
  echo; echo "== Pods"; kubectl -n $NS get pods -o wide --no-headers | awk '{printf "%-40s %-10s %s\n", $1, $3, $7}'
  echo; echo "== CPU"; kubectl -n $NS top pods 2>/dev/null | grep -E 'NAME|backend'
  echo; echo "== Postgres connections by user (max_connections=40)"
  kubectl -n $NS exec postgres-0 -- psql -U chat -tAc \
    "SELECT usename, count(*) FROM pg_stat_activity WHERE backend_type='client backend' GROUP BY usename ORDER BY 2 DESC" 2>/dev/null \
    || echo "FULL - even the admin cannot connect (or using RDS: check CloudWatch DatabaseConnections)"
  sleep 3
done
