// Utility for mapping editor ratio to PDF scroll ratio with adaptive bias.
// Future: incorporate gamma correction or page height distribution sampling.

export interface ScrollMappingOptions {
  baseBias?: number;      // baseline bias applied near top
  taper?: boolean;        // whether to taper bias toward end
  gamma?: number;         // optional exponent for non-linear mapping (1 = linear)
}

export function mapEditorToPdfRatio(editorRatio: number, opts: ScrollMappingOptions = {}): number {
  const r = Math.min(1, Math.max(0, editorRatio));
  const baseBias = opts.baseBias ?? 0.08;
  const taper = opts.taper !== false; // default true
  const gamma = opts.gamma ?? 1;
  // Non-linear adjustment (gamma < 1 pulls earlier, >1 pushes later)
  const gammaAdjusted = Math.pow(r, gamma);
  const bias = taper ? baseBias * (1 - gammaAdjusted) : baseBias;
  let out = gammaAdjusted + bias;
  if (out > 1) out = 1;
  return out;
}
