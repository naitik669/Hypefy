#!/bin/bash
# Runs 0220, 0223 and 0224 against a throwaway schema in a local Postgres
# and checks who can reach which stickers and packs, as each user. Needs
# psql and a database you can drop the public, auth and storage schemas
# of — never point this at a real project: stub.sql starts by dropping them.
#
#   PGDATABASE=scratch supabase/checks/sticker_packs/run.sh
#
# Set MIGRATIONS to a space-separated list to run a changed copy instead
# (that is how the mutation checks run). Prints "ALL CHECKS PASSED", or
# stops at the first check that failed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
mig="$here/../../migrations"
default="$mig/0220_dm_stickers.sql $mig/0223_sticker_favourites.sql"
[ -f "$mig/0224_sticker_packs.sql" ] && default="$default $mig/0224_sticker_packs.sql"
checks="$here/checks.sql"
[ -f "$mig/0224_sticker_packs.sql" ] && checks="$checks $here/checks_packs.sql"
# shellcheck disable=SC2086
{ cat "$here/stub.sql" ${MIGRATIONS:-$default} $checks; echo "\\echo ALL CHECKS PASSED"; } \
  | psql -q -X -v ON_ERROR_STOP=1 2>&1 | grep -E "ALL CHECKS PASSED|ERROR|FAILED" || true
