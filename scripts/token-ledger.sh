#!/usr/bin/env bash
# Sums the `Tokens-Burned:` trailer (and its per-model `Tokens-Burned-<model>:` breakdown) across
# every commit in the current branch's history — the one and only source of truth for the
# counter the app displays. See README.md ("How the displayed total stays correct with PRs
# landing in parallel") for why this is a full recompute over git log rather than a value anyone
# increments: recomputing from the log is what keeps concurrent PRs from racing each other.
set -euo pipefail

log=$(git log --format='%B')

total=$(grep -oE '^Tokens-Burned:[[:space:]]*[0-9]+' <<<"$log" | grep -oE '[0-9]+$' | awk '{sum += $1} END {print sum + 0}')
commits=$(grep -cE '^Tokens-Burned:[[:space:]]*[0-9]+' <<<"$log")

# Per-model breakdown from `Tokens-Burned-<model>: <n>` lines, summed by model.
by_model=$(grep -oE '^Tokens-Burned-[^:]+:[[:space:]]*[0-9]+' <<<"$log" \
  | sed -E 's/^Tokens-Burned-([^:]+):[[:space:]]*([0-9]+)$/\1 \2/' \
  | awk '{sum[$1] += $2} END {for (m in sum) printf "%s %d\n", m, sum[m]}' \
  | sort)

if [[ "${1:-}" == "--json" ]]; then
  model_json=$(awk '{printf "%s\"%s\":%d", (NR>1?",":""), $1, $2}' <<<"$by_model")
  printf '{"total":%s,"commitsWithTrailer":%s,"byModel":{%s},"generatedAt":"%s"}\n' \
    "$total" "$commits" "$model_json" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  echo "Tokens burned (all commits with a trailer): $total"
  echo "Commits carrying a Tokens-Burned trailer:   $commits"
  if [[ -n "$by_model" ]]; then
    echo "By model:"
    while read -r model count; do
      [[ -z "$model" ]] && continue
      echo "  $model: $count"
    done <<<"$by_model"
  fi
fi
