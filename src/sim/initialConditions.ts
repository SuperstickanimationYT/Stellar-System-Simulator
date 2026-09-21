import { GRAVITATIONAL_CONSTANT } from "./constants";
import { compositionOfPure, type ElementSymbol } from "./elements";
import { ParticleStore } from "./particles";

export interface CloudSpec {
  particleCount: number;
  totalMass: number;
  cloudRadius: number;
  bulkDensity: number;
  rotationalEnergyFraction: number;
  material: ElementSymbol;
  seed: number;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let scrambled = Math.imul(state ^ (state >>> 15), 1 | state);
    scrambled = (scrambled + Math.imul(scrambled ^ (scrambled >>> 7), 61 | scrambled)) ^ scrambled;
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  };
}

export function particleMassOf(spec: CloudSpec): number {
  return spec.totalMass / spec.particleCount;
}

export function meanDensityOf(spec: CloudSpec): number {
  return spec.totalMass / ((4 / 3) * Math.PI * spec.cloudRadius ** 3);
}

export function freeFallTime(spec: CloudSpec): number {
  return Math.sqrt((3 * Math.PI) / (32 * GRAVITATIONAL_CONSTANT * meanDensityOf(spec)));
}

export function solidBodyRotationRate(
  totalMass: number,
  cloudRadius: number,
  rotationalEnergyFraction: number,
): number {
  return Math.sqrt(
    (3 * GRAVITATIONAL_CONSTANT * totalMass * rotationalEnergyFraction) / cloudRadius ** 3,
  );
}

export function buildRotatingCloud(spec: CloudSpec): ParticleStore {
  const random = seededRandom(spec.seed);
  const store = new ParticleStore(spec.bulkDensity, Math.max(256, spec.particleCount * 2));
  const composition = compositionOfPure(spec.material);
  const particleMass = particleMassOf(spec);

  const positions: [number, number, number][] = [];
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;

  for (let i = 0; i < spec.particleCount; i++) {
    const distance = spec.cloudRadius * Math.cbrt(random());
    const cosineOfPolarAngle = 2 * random() - 1;
    const sineOfPolarAngle = Math.sqrt(1 - cosineOfPolarAngle * cosineOfPolarAngle);
    const azimuth = 2 * Math.PI * random();

    const x = distance * sineOfPolarAngle * Math.cos(azimuth);
    const y = distance * sineOfPolarAngle * Math.sin(azimuth);
    const z = distance * cosineOfPolarAngle;

    positions.push([x, y, z]);
    centroidX += x;
    centroidY += y;
    centroidZ += z;
  }

  centroidX /= spec.particleCount;
  centroidY /= spec.particleCount;
  centroidZ /= spec.particleCount;

  const rotationRate = solidBodyRotationRate(
    spec.totalMass,
    spec.cloudRadius,
    spec.rotationalEnergyFraction,
  );

  for (const [rawX, rawY, rawZ] of positions) {
    const x = rawX - centroidX;
    const y = rawY - centroidY;
    const z = rawZ - centroidZ;
    store.add({
      mass: particleMass,
      position: [x, y, z],
      velocity: [-rotationRate * y, rotationRate * x, 0],
      composition,
    });
  }

  removeNetMomentum(store);
  return store;
}

function removeNetMomentum(store: ParticleStore): void {
  let totalMass = 0;
  let momentumX = 0;
  let momentumY = 0;
  let momentumZ = 0;

  for (let i = 0; i < store.count; i++) {
    const m = store.mass[i];
    totalMass += m;
    momentumX += m * store.velocityX[i];
    momentumY += m * store.velocityY[i];
    momentumZ += m * store.velocityZ[i];
  }

  const driftX = momentumX / totalMass;
  const driftY = momentumY / totalMass;
  const driftZ = momentumZ / totalMass;

  for (let i = 0; i < store.count; i++) {
    store.velocityX[i] -= driftX;
    store.velocityY[i] -= driftY;
    store.velocityZ[i] -= driftZ;
  }
}
