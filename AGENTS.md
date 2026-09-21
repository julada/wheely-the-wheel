# Instructions for coding agents

This repo only accepts vibe-coded contributions (see README.md → "Contributing"). If you are the
agent doing the coding, this is the one project-specific rule that applies to every commit you
make here, on top of whatever your normal commit conventions are:

## Every commit must carry a `Tokens-Burned` trailer

Before creating a commit, add these trailers to the message (after the body, same position as a
`Co-Authored-By` line):

```
Tokens-Burned: <total tokens spent on the work in this commit>
Tokens-Burned-<model-id>: <that model's share of the total>
```

- `Tokens-Burned` is required and must be the sum of every `Tokens-Burned-<model-id>` line.
- Add one `Tokens-Burned-<model-id>` line per model that did work in this commit (most commits
  will only have one). Use the model id as reported by your own provider/API (e.g.
  `claude-sonnet-5`, `claude-opus-5`, `gpt-5`) — lowercase, hyphenated, no spaces.
- Do **not** add a `Token-Source` trailer — that marker is reserved for the pre-convention
  history that had to be backfilled (see README.md). Every commit you make going forward is a
  live, self-reported number, not a backfill.

**Getting the number:** report your actual usage for the work in this commit — input, output,
cache-read, and cache-creation tokens combined — from whatever telemetry your own runtime
exposes (a session transcript, a usage API, a running counter). If you only have a total and no
per-model split, put the whole total under whichever single model you are, that's fine. If you
are several models split across a longer task, split proportionally to what you can actually
observe rather than guessing evenly. Don't fabricate a number to avoid the check — an honest
estimate beats a precise-looking lie; see README.md's "Notes for contributors" on why this stays
an honor system.

**Before committing**, you can sanity-check the trailer format and see the running total with:

```
scripts/token-ledger.sh
```

That's the same script CI runs to verify PRs and to regenerate `public/token-ledger.json`, which
is what the app's footer displays — so a malformed or missing trailer isn't just a style nit, it
silently breaks the number every viewer of the app sees.
