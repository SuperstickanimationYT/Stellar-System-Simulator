export const ELEMENT_SYMBOLS = ["H", "He", "C", "N", "O", "Ne", "Mg", "Si", "S", "Fe"] as const;

export type ElementSymbol = (typeof ELEMENT_SYMBOLS)[number];

export const ELEMENT_COUNT = ELEMENT_SYMBOLS.length;

const indexBySymbol = new Map<ElementSymbol, number>(
  ELEMENT_SYMBOLS.map((symbol, index) => [symbol, index]),
);

export function elementIndex(symbol: ElementSymbol): number {
  const index = indexBySymbol.get(symbol);
  if (index === undefined) throw new Error(`Unknown element ${symbol}`);
  return index;
}

export function compositionOfPure(symbol: ElementSymbol): Float64Array {
  const fractions = new Float64Array(ELEMENT_COUNT);
  fractions[elementIndex(symbol)] = 1;
  return fractions;
}

export function dominantElement(fractions: Float64Array, offset = 0): ElementSymbol {
  let bestIndex = 0;
  let bestFraction = -1;
  for (let element = 0; element < ELEMENT_COUNT; element++) {
    const fraction = fractions[offset + element];
    if (fraction > bestFraction) {
      bestFraction = fraction;
      bestIndex = element;
    }
  }
  return ELEMENT_SYMBOLS[bestIndex];
}
