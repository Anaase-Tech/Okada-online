#!/usr/bin/env bash
# Regression test for check-deprecated-firebase-config.sh.
#
# Added in PASS 4 after PASS 3 found the previous inline CI guard's regex
# had an unescaped/mismatched parenthesis that made grep fail to compile
# ("Unmatched ( or \("), and the surrounding `if` treated that failure as
# "nothing found" - so the guard never actually caught anything.
#
# This test exercises the real check-deprecated-firebase-config.sh script
# (not a reimplementation) against disposable fixtures, so a future
# regression in the guard's own logic is caught automatically. Scripts are
# invoked through `bash` so this works whether or not the executable bit
# survived the checkout/push path.

set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$here/check-deprecated-firebase-config.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail=0

assert_exit() {
  local desc="$1" expected="$2" dir="$3"
  bash "$guard" "$dir" > "$work/out.log" 2>&1
  local actual=$?
  if [ "$actual" -eq "$expected" ]; then
    echo "PASS: $desc (exit $actual)"
  else
    echo "FAIL: $desc - expected exit $expected, got $actual"
    sed 's/^/    /' "$work/out.log"
    fail=1
  fi
}

# Case A: functions.config() must be rejected (exit 1)
mkdir -p "$work/caseA"
echo "const s = functions.config();" > "$work/caseA/sample.js"
assert_exit "Case A: functions.config() is rejected" 1 "$work/caseA"

# Case B: functions.config?.() (optional chaining) must also be rejected (exit 1)
mkdir -p "$work/caseB"
echo "const s = functions.config?.().paystack?.secret;" > "$work/caseB/sample.js"
assert_exit "Case B: functions.config?.() is rejected" 1 "$work/caseB"

# Case C: a valid source file with no deprecated usage must pass (exit 0)
mkdir -p "$work/caseC"
echo "const s = defineSecret('PAYSTACK_SECRET');" > "$work/caseC/sample.js"
assert_exit "Case C: clean source passes" 0 "$work/caseC"

# Extra case: a *.bak* file containing the forbidden pattern must be
# skipped, matching the existing "do not scan backup files" convention
# used by the other guards in this workflow.
mkdir -p "$work/caseD"
echo "functions.config()" > "$work/caseD/old.js.bak2"
assert_exit "Case D: backup files are skipped" 0 "$work/caseD"

# Informational only: report the real repository's current state. This
# never fails the test on a "found" result (exit 1) - that is the guard
# doing its job on real code - and only fails if the guard itself errors.
repo_root="$(cd "$here/../../.." && pwd)"
bash "$guard" "$repo_root/backend/functions" > "$work/repo.log" 2>&1
repo_exit=$?
if [ "$repo_exit" -eq 1 ]; then
  echo "INFO: real repository contains functions.config usage - guard correctly detects it"
elif [ "$repo_exit" -eq 0 ]; then
  echo "INFO: real repository is clean of functions.config usage"
else
  echo "FAIL: guard errored while scanning the real repository (exit $repo_exit)"
  sed 's/^/    /' "$work/repo.log"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "check-deprecated-firebase-config self-test: FAILED"
  exit 1
fi

echo ""
echo "check-deprecated-firebase-config self-test: all cases passed"
exit 0
