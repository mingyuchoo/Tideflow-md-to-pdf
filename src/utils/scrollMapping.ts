// Simplified scroll mapping: currently pure linear with optional gamma.
// Rationale: Remove adaptive bias & TOC offset until baseline stability is confirmed.
// Future enhancements (re-add carefully, behind flags):
//  - TOC displacement handling
//  - Page height sampling for non-linear mapping
//  - Mild upward focus bias

export interface ScrollMappingOptions {
  gamma?: number; // Non-linear exponent (1 = linear)
  baseOffset?: number; // 0..0.5 shift to account for front-matter like TOC pages
}

export function mapEditorToPdfRatio(editorRatio: number, opts: ScrollMappingOptions = {}): number {
  const r = Math.min(1, Math.max(0, editorRatio));
  const gamma = opts.gamma ?? 1;
  const base = Math.min(0.5, Math.max(0, opts.baseOffset ?? 0));
  const shaped = gamma === 1 ? r : Math.pow(r, gamma);
  // Apply offset so 0 maps to base, 1 maps to 1
  return Math.min(1, Math.max(0, base + (1 - base) * shaped));
}
