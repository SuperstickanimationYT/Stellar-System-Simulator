import { GRAVITATIONAL_CONSTANT } from "./constants";
import { ParticleKind, type ParticleStore } from "./particles";

export interface Diagnostics {
  matterCount: number;
  totalMass: number;
  largestMass: number;
  kineticEnergy: number;
  potentialEnergy: number;
  thermalEnergy: number;
  bindingEnergy: number;
  totalEnergy: number;
  momentumMagnitude: number;
  angularMomentumMagnitude: number;
  flattening: number;
}

export function measure(store: ParticleStore, softeningLength: number): Diagnostics {
  const { count, kind, mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ } =
    store;

  let matterCount = 0;
  let totalMass = 0;
  let largestMass = 0;
  let kineticEnergy = 0;
  let thermalEnergy = 0;
  let bindingEnergy = 0;
  let momentumX = 0;
  let momentumY = 0;
  let momentumZ = 0;
  let angularX = 0;
  let angularY = 0;
  let angularZ = 0;
  let centreX = 0;
  let centreY = 0;
  let centreZ = 0;

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    const m = mass[i];
    const vx = velocityX[i];
    const vy = velocityY[i];
    const vz = velocityZ[i];

    matterCount++;
    totalMass += m;
    if (m > largestMass) largestMass = m;
    kineticEnergy += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    thermalEnergy += store.thermalEnergy[i];
    bindingEnergy += store.bindingEnergy[i];

    centreX += m * positionX[i];
    centreY += m * positionY[i];
    centreZ += m * positionZ[i];

    momentumX += m * vx;
    momentumY += m * vy;
    momentumZ += m * vz;

    angularX += m * (positionY[i] * vz - positionZ[i] * vy);
    angularY += m * (positionZ[i] * vx - positionX[i] * vz);
    angularZ += m * (positionX[i] * vy - positionY[i] * vx);
  }

  if (totalMass > 0) {
    centreX /= totalMass;
    centreY /= totalMass;
    centreZ /= totalMass;
  }

  const softeningSquared = softeningLength * softeningLength;
  let potentialEnergy = 0;

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    for (let j = i + 1; j < count; j++) {
      if (kind[j] !== ParticleKind.Matter) continue;
      const dx = positionX[j] - positionX[i];
      const dy = positionY[j] - positionY[i];
      const dz = positionZ[j] - positionZ[i];
      const separation = Math.sqrt(dx * dx + dy * dy + dz * dz + softeningSquared);
      if (separation === 0) continue;
      potentialEnergy -= (GRAVITATIONAL_CONSTANT * mass[i] * mass[j]) / separation;
    }
  }

  return {
    flattening: measureFlattening(store, centreX, centreY, centreZ, angularX, angularY, angularZ),
    matterCount,
    totalMass,
    largestMass,
    kineticEnergy,
    potentialEnergy,
    thermalEnergy,
    bindingEnergy,
    totalEnergy: kineticEnergy + potentialEnergy + thermalEnergy + bindingEnergy,
    momentumMagnitude: Math.hypot(momentumX, momentumY, momentumZ),
    angularMomentumMagnitude: Math.hypot(angularX, angularY, angularZ),
  };
}

function measureFlattening(
  store: ParticleStore,
  centreX: number,
  centreY: number,
  centreZ: number,
  angularX: number,
  angularY: number,
  angularZ: number,
): number {
  const axisLength = Math.hypot(angularX, angularY, angularZ);
  if (axisLength === 0) return 1;

  const axisX = angularX / axisLength;
  const axisY = angularY / axisLength;
  const axisZ = angularZ / axisLength;

  let withinPlane = 0;
  let alongAxis = 0;

  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;
    const dx = store.positionX[i] - centreX;
    const dy = store.positionY[i] - centreY;
    const dz = store.positionZ[i] - centreZ;
    const projection = dx * axisX + dy * axisY + dz * axisZ;
    const mass = store.mass[i];

    alongAxis += mass * projection * projection;
    withinPlane += mass * (dx * dx + dy * dy + dz * dz - projection * projection);
  }

  if (alongAxis === 0) return Infinity;
  return Math.sqrt(withinPlane / 2 / alongAxis);
}
