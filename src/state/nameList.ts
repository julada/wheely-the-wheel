const STORAGE_KEY = "wheel-of-fortune-names";
const DEFAULT_NAMES = "Ada\nGrace\nKatherine\nMargaret\nHedy";

// A line starting with "!" (after leading whitespace) is a name that's kept
// on the roster but excluded from the wheel — lets a team cross someone out
// for one round without losing them from a shared link.
const DISABLED_PREFIX = "!";

export interface NameEntry {
  name: string;
  disabled: boolean;
}

function isDisabledLine(line: string): boolean {
  return line.trimStart().startsWith(DISABLED_PREFIX);
}

function withDisabledMark(line: string, disabled: boolean): string {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const rest = line.slice(leading.length).replace(/^!\s*/, "");
  return disabled ? `${leading}${DISABLED_PREFIX}${rest}` : `${leading}${rest}`;
}

/** Owns the raw textarea contents, persistence, and the parsed name list derived from it. */
export class NameList {
  private raw: string;
  private allEntries: NameEntry[] = [];
  private enabledNames: string[] = [];

  constructor(initialText?: string) {
    this.raw = initialText ?? localStorage.getItem(STORAGE_KEY) ?? DEFAULT_NAMES;
    localStorage.setItem(STORAGE_KEY, this.raw);
    this.reparse();
  }

  get text(): string {
    return this.raw;
  }

  /** Every non-blank entry in source order, including disabled ones. */
  get entries(): readonly NameEntry[] {
    return this.allEntries;
  }

  /** Names actually on the wheel (blank and disabled lines excluded). */
  get names(): string[] {
    return this.enabledNames;
  }

  get count(): number {
    return this.enabledNames.length;
  }

  setText(value: string): void {
    this.raw = value;
    localStorage.setItem(STORAGE_KEY, this.raw);
    this.reparse();
  }

  /** Flips the enabled/disabled mark on the nth non-blank line (matching an `entries` index). */
  toggleDisabled(entryIndex: number): void {
    const lines = this.raw.split("\n");
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) continue;
      if (count === entryIndex) {
        lines[i] = withDisabledMark(line, !isDisabledLine(line));
        break;
      }
      count++;
    }
    this.raw = lines.join("\n");
    localStorage.setItem(STORAGE_KEY, this.raw);
    this.reparse();
  }

  private reparse(): void {
    this.allEntries = [];
    this.enabledNames = [];
    for (const line of this.raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const disabled = isDisabledLine(line);
      const name = disabled ? trimmed.slice(DISABLED_PREFIX.length).trim() : trimmed;
      if (name.length === 0) continue;
      this.allEntries.push({ name, disabled });
      if (!disabled) this.enabledNames.push(name);
    }
  }
}
