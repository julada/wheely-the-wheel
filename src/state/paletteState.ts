const STORAGE_KEY = "wheel-of-fortune-palette";

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseColors(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => HEX_COLOR_RE.test(s));
}

/** Owns the raw palette-input text, persistence, and the parsed custom color list derived from
 *  it. An empty/invalid input means "no override" — callers fall back to their own default. */
export class PaletteState {
  private raw: string;
  private parsed: string[] = [];

  constructor(initialText?: string) {
    this.raw = initialText ?? localStorage.getItem(STORAGE_KEY) ?? "";
    localStorage.setItem(STORAGE_KEY, this.raw);
    this.reparse();
  }

  get text(): string {
    return this.raw;
  }

  /** Parsed custom colors, or empty if the input is blank/invalid. */
  get colors(): string[] {
    return this.parsed;
  }

  setText(value: string): void {
    this.raw = value;
    localStorage.setItem(STORAGE_KEY, this.raw);
    this.reparse();
  }

  private reparse(): void {
    this.parsed = parseColors(this.raw);
  }
}
