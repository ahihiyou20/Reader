#!/bin/sh
# Commit and push translated articles every N changed files while translate.ts runs, so a long run
# survives the machine shutting down. Stops (after a last commit) when the translate process is gone.
#   sh scripts/pipeline/autocommit.sh [every=10] [gh-account]
every=${1:-10}
account=$2
cd "$(dirname "$0")/../.." || exit 1
branch=$(git branch --show-current)

commit() {
  git add content/articles
  git diff --cached --quiet && return
  n=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -q -m "content: translations ($n articles, autosave)"
  if [ -n "$account" ]; then
    # The token comes from gh at push time; it is never written to disk or the command line.
    git -c credential.helper= -c "credential.helper=!f() { echo username=x-access-token; echo password=\$(gh auth token -u $account); }; f" push -q origin "HEAD:$branch"
  else
    git push -q origin "HEAD:$branch"
  fi
  echo "$(date '+%H:%M') committed $n"
}

while pgrep -f "scripts/pipeline/translate.ts" >/dev/null; do
  changed=$(git status --porcelain content/articles | wc -l | tr -d ' ')
  [ "$changed" -ge "$every" ] && commit
  sleep 60
done
commit
