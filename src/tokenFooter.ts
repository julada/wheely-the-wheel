/** Shape of public/token-ledger.json, produced by scripts/token-ledger.sh --json (see README.md
 *  for why this is always a full recompute over the commit history, never a value anyone bumps
 *  in place — that's what keeps it correct with PRs landing in parallel). */
interface TokenLedger {
  total: number;
  byModel: Record<string, number>;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Populates the "tokens burned building this" footer from the static ledger file. Fails
 *  silently (footer stays hidden) if the file is missing — e.g. a fork that hasn't wired up the
 *  ledger-generating CI job yet shouldn't show a broken counter. */
export async function mountTokenFooter(): Promise<void> {
  const footer = document.getElementById("tokenFooter");
  const totalEl = document.getElementById("tokenFooterTotal");
  const popover = document.getElementById("tokenInfoPopover");
  if (!footer || !totalEl || !popover) return;

  let ledger: TokenLedger;
  try {
    // Relative, not root-absolute: same reason as vite.config.ts's base:"./" — a GitHub Pages
    // project site serves from /repo-name/, not the domain root, so "/token-ledger.json" 404s
    // there (this fetch isn't rewritten by Vite's base setting, unlike script/link tag URLs).
    const res = await fetch("./token-ledger.json", { cache: "no-store" });
    if (!res.ok) return;
    ledger = await res.json();
  } catch {
    return;
  }
  if (!ledger || typeof ledger.total !== "number") return;

  totalEl.textContent = formatCount(ledger.total);

  const rows = Object.entries(ledger.byModel ?? {}).sort(([, a], [, b]) => b - a);
  popover.innerHTML = "";
  const title = document.createElement("div");
  title.className = "info-popover-title";
  title.textContent = "Tokens burned, by model";
  popover.appendChild(title);
  for (const [model, count] of rows) {
    const row = document.createElement("div");
    row.className = "info-popover-row";
    const name = document.createElement("span");
    name.textContent = model;
    const value = document.createElement("span");
    value.textContent = formatCount(count);
    row.append(name, value);
    popover.appendChild(row);
  }

  footer.hidden = false;
}
