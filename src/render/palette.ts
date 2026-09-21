const SWATCH_COUNT = 64;

const swatches: string[] = Array.from({ length: SWATCH_COUNT }, (_, step) => {
  const t = step / (SWATCH_COUNT - 1);
  const hue = 215 - 175 * t;
  const saturation = 55 + 40 * t;
  const lightness = 62 + 20 * t;
  return `hsl(${hue.toFixed(1)} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%)`;
});

export function swatchForMassRatio(massInParticleUnits: number): string {
  const decades = Math.log10(Math.max(1, massInParticleUnits)) / 3;
  const step = Math.min(SWATCH_COUNT - 1, Math.max(0, Math.round(decades * (SWATCH_COUNT - 1))));
  return swatches[step];
}
