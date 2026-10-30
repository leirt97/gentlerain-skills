#!/bin/sh
# Starts the local itsaplan Docker instance and waits until api and web are healthy. Safe to rerun.
# Usage: sh start.sh   (ITSAPLAN_DIR overrides the checkout path)
set -eu
dir=${ITSAPLAN_DIR:-$HOME/D/Projects/itsaplan}

colima status >/dev/null 2>&1 || colima start
cd "$dir"
# --wait names api and web only: migrate and minio-init are one-shots and their exit counts as a failure.
docker compose up -d --wait --no-recreate api web
docker compose ps --format '{{.Service}}\t{{.Status}}'
grep -E '^(APP_URL|API_URL)=' .env
