#!/bin/bash
# Runs 0174 and 0221 against a throwaway schema in a local Postgres and
# checks who can read and write what, as each user. Needs psql and a
# database you can drop the public and auth schemas of — never point this
# at a real project: stub.sql starts by dropping both.
#
#   PGDATABASE=scratch supabase/checks/0221_dm_interactive_stickers/run.sh
#
# Prints "ALL CHECKS PASSED", or stops at the first check that failed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
mig="$here/../../migrations"
cat "$here/stub.sql" "$mig/0174_dm_polls.sql" "${MIGRATION:-$mig/0221_dm_interactive_stickers.sql}" "$here/checks.sql" \
  | psql -q -X -v ON_ERROR_STOP=1 2>&1 | grep -E "ALL CHECKS PASSED|ERROR|FAILED"
