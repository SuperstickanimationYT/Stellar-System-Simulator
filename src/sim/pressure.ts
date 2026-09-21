import { BOLTZMANN_CONSTANT, HYDROGEN_MASS } from "./constants";
import { ParticleKind, type ParticleStore } from "./particles";

export interface GasSettings {
  enabled: boolean;
  floorTemperature: number;
  meanMolecularWeight: number;
  adiabaticIndex: number;
  opaqueDensity: number;
  neighbourSmoothing: number;
  smoothingIterations: number;
}

export const defaultGas: GasSettings = {
  enabled: true,
  floorTemperature: 10,
  meanMolecularWeight: 2.33,
  adiabaticIndex: 5 / 3,
  opaqueDensity: 1e-10,
  neighbourSmoothing: 1.2,
  smoothingIterations: 2,
};

export function isothermalSoundSpeedSquared(gas: GasSettings): number {
  return (BOLTZMANN_CONSTANT * gas.floorTemperature) / (gas.meanMolecularWeight * HYDROGEN_MASS);
}

function stiffening(density: number, gas: GasSettings): number {
  return (density / gas.opaqueDensity) ** (gas.adiabaticIndex - 1);
}

export function soundSpeedAt(density: number, gas: GasSettings): number {
  return Math.sqrt(
    isothermalSoundSpeedSquared(gas) * (1 + gas.adiabaticIndex * stiffening(density, gas)),
  );
}

function kernelWeight(separation: number, smoothing: number): number {
  const q = separation / smoothing;
  if (q >= 2) return 0;
  const normalisation = 1 / (Math.PI * smoothing ** 3);
  if (q < 1) return normalisation * (1 - 1.5 * q * q + 0.75 * q * q * q);
  return normalisation * 0.25 * (2 - q) ** 3;
}

function kernelSlope(separation: number, smoothing: number): number {
  const q = separation / smoothing;
  if (q >= 2 || q === 0) return 0;
  const normalisation = 1 / (Math.PI * smoothing ** 4);
  if (q < 1) return normalisation * (-3 * q + 2.25 * q * q);
  return normalisation * -0.75 * (2 - q) ** 2;
}

export function updateGasState(store: ParticleStore, gas: GasSettings): void {
  const { count, kind, mass, density, pressure, temperature, smoothingLength } = store;
  const soundSpeedSquared = isothermalSoundSpeedSquared(gas);

  seedSmoothingLengths(store, gas);

  for (let pass = 0; pass <= gas.smoothingIterations; pass++) {
    for (let i = 0; i < count; i++) {
      if (kind[i] !== ParticleKind.Matter) continue;
      const smoothing = smoothingLength[i];
      let summed = mass[i] * kernelWeight(0, smoothing);

      for (let j = 0; j < count; j++) {
        if (j === i || kind[j] !== ParticleKind.Matter) continue;
        const dx = store.positionX[j] - store.positionX[i];
        const dy = store.positionY[j] - store.positionY[i];
        const dz = store.positionZ[j] - store.positionZ[i];
        const separation = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (separation >= 2 * smoothing) continue;
        summed += mass[j] * kernelWeight(separation, smoothing);
      }

      density[i] = summed;
      if (pass < gas.smoothingIterations && summed > 0) {
        smoothingLength[i] = gas.neighbourSmoothing * Math.cbrt(mass[i] / summed);
      }
    }
  }

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    const stiffened = 1 + stiffening(density[i], gas);
    pressure[i] = soundSpeedSquared * density[i] * stiffened;
    temperature[i] = gas.floorTemperature * stiffened;
  }
}

function seedSmoothingLengths(store: ParticleStore, gas: GasSettings): void {
  let needsSeed = false;
  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] === ParticleKind.Matter && !(store.smoothingLength[i] > 0)) {
      needsSeed = true;
      break;
    }
  }
  if (!needsSeed) return;

  let totalMass = 0;
  let matterCount = 0;
  let centreX = 0;
  let centreY = 0;
  let centreZ = 0;
  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;
    const m = store.mass[i];
    totalMass += m;
    matterCount++;
    centreX += m * store.positionX[i];
    centreY += m * store.positionY[i];
    centreZ += m * store.positionZ[i];
  }
  if (matterCount === 0 || totalMass === 0) return;
  centreX /= totalMass;
  centreY /= totalMass;
  centreZ /= totalMass;

  let weightedSquareRadius = 0;
  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;
    const dx = store.positionX[i] - centreX;
    const dy = store.positionY[i] - centreY;
    const dz = store.positionZ[i] - centreZ;
    weightedSquareRadius += store.mass[i] * (dx * dx + dy * dy + dz * dz);
  }

  const equivalentRadius = Math.sqrt(weightedSquareRadius / totalMass) / Math.sqrt(3 / 5);
  const meanDensity = totalMass / ((4 / 3) * Math.PI * equivalentRadius ** 3);

  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;
    if (store.smoothingLength[i] > 0) continue;
    store.smoothingLength[i] = gas.neighbourSmoothing * Math.cbrt(store.mass[i] / meanDensity);
  }
}

export function accumulatePressureAcceleration(store: ParticleStore): void {
  const { count, kind, mass, density, pressure, smoothingLength } = store;

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    const densityI = density[i];
    if (densityI <= 0) continue;
    const termI = pressure[i] / (densityI * densityI);

    for (let j = i + 1; j < count; j++) {
      if (kind[j] !== ParticleKind.Matter) continue;
      const densityJ = density[j];
      if (densityJ <= 0) continue;

      const dx = store.positionX[j] - store.positionX[i];
      const dy = store.positionY[j] - store.positionY[i];
      const dz = store.positionZ[j] - store.positionZ[i];
      const separation = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (separation === 0) continue;
      if (separation >= 2 * smoothingLength[i] && separation >= 2 * smoothingLength[j]) continue;

      const slope =
        0.5 *
        (kernelSlope(separation, smoothingLength[i]) + kernelSlope(separation, smoothingLength[j]));
      if (slope === 0) continue;

      const termJ = pressure[j] / (densityJ * densityJ);
      const shared = (termI + termJ) * slope;

      const towardsX = dx / separation;
      const towardsY = dy / separation;
      const towardsZ = dz / separation;

      const onI = shared * mass[j];
      const onJ = shared * mass[i];

      store.accelerationX[i] += onI * towardsX;
      store.accelerationY[i] += onI * towardsY;
      store.accelerationZ[i] += onI * towardsZ;

      store.accelerationX[j] -= onJ * towardsX;
      store.accelerationY[j] -= onJ * towardsY;
      store.accelerationZ[j] -= onJ * towardsZ;
    }
  }
}
