#!/bin/sh
# Local dev server. Native ES modules will not load over file://, so the app
# has to be served over HTTP even though there is no build step.
#
#   ./serve.sh          serve on port 8000
#   PORT=3000 ./serve.sh
#
# Uses only the Python standard library — nothing to install, no virtualenv.

set -e

PORT="${PORT:-8000}"
DIR="$(cd "$(dirname "$0")" && pwd)"

printf '\n  Gut & Grain — serving %s\n\n' "$DIR"
printf '  App  (real data)   http://localhost:%s/\n' "$PORT"
printf '  App  (mock data)   http://localhost:%s/?mock\n' "$PORT"
printf '  Tests              http://localhost:%s/tests/\n\n' "$PORT"
printf '  Mock as a member   http://localhost:%s/?mock&user=sam\n' "$PORT"
printf '  Mock, fresh start  http://localhost:%s/?mock&reset\n\n' "$PORT"
printf '  Ctrl-C to stop.\n\n'

exec python3 -m http.server "$PORT" --directory "$DIR"
