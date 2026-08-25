#!/usr/bin/env bash
# Prep the local Supabase stack for manual browser testing:
# starts the stack, resets to a clean migrated DB, and writes .env.local
# with the local URL/anon key so the Expo app can talk to it.
#
# Usage: ./supabase/scripts/prep-manual-testing.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

SUPABASE="npx --yes supabase@2.115.0"

echo "==> Starting local Supabase stack..."
$SUPABASE start

echo "==> Resetting local database to a clean migrated state..."
$SUPABASE db reset

echo "==> Reading local connection info..."
STATUS_JSON="$($SUPABASE status -o json)"

API_URL="$(echo "$STATUS_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).API_URL')"
ANON_KEY="$(echo "$STATUS_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).ANON_KEY')"
STUDIO_URL="$(echo "$STATUS_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).STUDIO_URL')"
MAILPIT_URL="http://127.0.0.1:54324"

if [[ -z "$API_URL" || -z "$ANON_KEY" ]]; then
  echo "Could not parse API URL / anon key from 'supabase status -o json'. Aborting." >&2
  exit 1
fi

# supabase status reports 127.0.0.1; the app must use localhost so the
# auth callback origin matches config.toml's site_url exactly.
API_URL="${API_URL/127.0.0.1/localhost}"

ENV_FILE="$REPO_ROOT/.env.local"
{
  echo "EXPO_PUBLIC_SUPABASE_URL=$API_URL"
  echo "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY"
} > "$ENV_FILE"

echo "==> Wrote $ENV_FILE"
echo
echo "Local stack ready:"
echo "  API:     $API_URL"
echo "  Studio:  $STUDIO_URL"
echo "  Mailpit: $MAILPIT_URL"
echo
echo "Next steps:"
echo "  1. yarn expo start --web   (must run on port 8081 — the only registered auth callback origin)"
echo "  2. Open Studio and Mailpit above alongside the app to watch rows / confirmation emails"
echo "  3. When done: npx --yes supabase@2.115.0 stop"
echo "  4. Between test passes: npx --yes supabase@2.115.0 db reset"
