#!/usr/bin/env bash
# Detects deprecated Firebase Gen-1 runtime config usage (functions.config(),
# functions.config?.(), or any other call style) in backend source files.
#
# Exit codes:
#   0  - no deprecated usage found (guard passes, CI continues)
#   1  - deprecated usage found (guard fails, CI must stop)
#   2  - the guard itself could not run correctly (treated as a hard failure,
#        never silently swallowed - see PASS 3 / PASS 4 correction history)
#
# Usage: check-deprecated-firebase-config.sh <directory-to-scan>

set -u
scan_dir="${1:-.}"

matches=""
grep_status=0
# Plain recursive grep (not find|xargs) so grep's own exit code is what we
# actually observe: 0 = match, 1 = no match, 2+ = real error. Piping through
# xargs collapses grep's normal "no match" (1) and a genuine grep failure
# (2+) into the same xargs exit code (123), which made this distinction
# unreliable - confirmed while testing this fix.
#
# --include is used alone, without --exclude: combining --include and
# --exclude on this GNU grep causes --include to be silently ignored
# (confirmed empirically while writing this script - it started matching
# this very .sh file despite --include='*.js'). --include='*.js' alone
# already skips every backup file in this repo, since none of them end in
# a literal ".js".
matches="$(grep -RniE --exclude-dir=node_modules --include='*.js' 'functions\.config' "$scan_dir")" || grep_status=$?

if [ "$grep_status" -eq 0 ]; then
  echo "Deprecated functions.config usage detected:"
  echo "$matches"
  exit 1
elif [ "$grep_status" -eq 1 ]; then
  # grep's normal "no lines matched" exit code - guard passes.
  exit 0
else
  # Any other exit code means grep itself failed (bad pattern, I/O error,
  # etc.) - this must be a hard CI failure, not a silent pass. This is the
  # exact failure mode PASS 3 found in the previous version of this guard
  # (a malformed regex compiled to a grep error that the surrounding `if`
  # treated as "nothing found").
  echo "check-deprecated-firebase-config.sh: guard failed to run (grep exit $grep_status) - treating as a hard failure rather than a silent pass"
  exit 2
fi
