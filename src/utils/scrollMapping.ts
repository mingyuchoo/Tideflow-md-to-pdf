// Utility for mapping editor ratio to PDF scroll ratio with adaptive bias.
// Future: incorporate gamma correction or page height distribution sampling.

export interface ScrollMappingOptions {
  baseBias?: number;           // Baseline bias applied near top (default 0.06)
  taper?: boolean;             // Taper bias toward end (default true)
  gamma?: number;              // Non-linear exponent (1 = linear)
  bottomClampThreshold?: number; // When adjusted ratio exceeds this, start clamping (default 0.92)
  bottomClampBias?: number;    // Residual bias allowed near bottom (default 0.01)
  tocOffset?: number;          // TOC page offset (0-1, typically 0.1-0.2 for 1-2 page TOC)
}

export function mapEditorToPdfRatio(editorRatio: number, opts: ScrollMappingOptions = {}): number {
  const r = Math.min(1, Math.max(0, editorRatio));
  const baseBias = opts.baseBias ?? 0.06;
  const taper = opts.taper !== false; // default true
  const gamma = opts.gamma ?? 1;
  const bottomClampThreshold = opts.bottomClampThreshold ?? 0.92;
  const bottomClampBias = opts.bottomClampBias ?? 0.01;
  const tocOffset = opts.tocOffset ?? 0;

  // Non-linear adjustment (gamma < 1 pulls earlier, >1 pushes later)
  const gammaAdjusted = Math.pow(r, gamma);
  // Adaptive bias: decreases as we move down
  const bias = taper ? baseBias * (1 - gammaAdjusted) : baseBias;
  let out = gammaAdjusted + bias;
  
  // Apply TOC offset - shift the mapping to skip TOC pages
  if (tocOffset > 0) {
    // Scale the content to the remaining space after TOC
    out = tocOffset + (out * (1 - tocOffset));
  }
  
  // Clamp near bottom to avoid overshoot accumulation
  if (out > bottomClampThreshold) {
    // Allow only a small residual bias near end
    const excess = out - bottomClampThreshold;
    out = bottomClampThreshold + Math.min(excess, bottomClampBias);
  }
  if (out > 1) out = 1;
  return out;
}
