import { ParticleKind, type ParticleStore } from "./particles";

export interface DissipationSettings {
  timescale: number;
  reach: number;
}

export const dissipationDisabled: DissipationSettings = { timescale: Infinity, reach: 0 };

export function isDissipating(settings: DissipationSettings): boolean {
  return Number.isFinite(settings.timescale) && settings.timescale > 0 && settings.reach > 0;
}

export function meanParticleSpacing(store: ParticleStore): number {
  let totalMass = 0;
  let matterCount = 0;
  let centreX = 0;
  let centreY = 0;
  let centreZ = 0;

  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;
    const mass = store.mass[i];
    totalMass += mass;
    matterCount++;
    centreX += mass * store.positionX[i];
    centreY += mass * store.positionY[i];
    centreZ += mass * store.positionZ[i];
  }

  if (matterCount < 2 || totalMass === 0) return 0;
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

  const rootMeanSquareRadius = Math.sqrt(weightedSquareRadius / totalMass);
  const equivalentUniformRadius = rootMeanSquareRadius / Math.sqrt(3 / 5);
  return Math.cbrt(((4 / 3) * Math.PI * equivalentUniformRadius ** 3) / matterCount);
}

export function applyShockDissipation(
  store: ParticleStore,
  timestep: number,
  settings: DissipationSettings,
): number {
  if (!isDissipating(settings)) return 0;

  const reachDistance = settings.reach * meanParticleSpacing(store);
  if (reachDistance <= 0) return 0;

  const removedFraction = 1 - Math.exp(-timestep / settings.timescale);
  const reachSquared = reachDistance * reachDistance;
  let heatReleased = 0;

  for (let i = 0; i < store.count; i++) {
    if (store.kind[i] !== ParticleKind.Matter) continue;

    for (let j = i + 1; j < store.count; j++) {
      if (store.kind[j] !== ParticleKind.Matter) continue;

      const dx = store.positionX[j] - store.positionX[i];
      const dy = store.positionY[j] - store.positionY[i];
      const dz = store.positionZ[j] - store.positionZ[i];
      const separationSquared = dx * dx + dy * dy + dz * dz;
      if (separationSquared === 0 || separationSquared > reachSquared) continue;

      const separation = Math.sqrt(separationSquared);
      const towardsX = dx / separation;
      const towardsY = dy / separation;
      const towardsZ = dz / separation;

      const approachSpeed =
        (store.velocityX[j] - store.velocityX[i]) * towardsX +
        (store.velocityY[j] - store.velocityY[i]) * towardsY +
        (store.velocityZ[j] - store.velocityZ[i]) * towardsZ;
      if (approachSpeed >= 0) continue;

      const massI = store.mass[i];
      const massJ = store.mass[j];
      const reducedMass = (massI * massJ) / (massI + massJ);
      const speedChange = -approachSpeed * removedFraction;
      const impulse = reducedMass * speedChange;

      store.velocityX[i] -= (impulse / massI) * towardsX;
      store.velocityY[i] -= (impulse / massI) * towardsY;
      store.velocityZ[i] -= (impulse / massI) * towardsZ;

      store.velocityX[j] += (impulse / massJ) * towardsX;
      store.velocityY[j] += (impulse / massJ) * towardsY;
      store.velocityZ[j] += (impulse / massJ) * towardsZ;

      const remainingSpeed = approachSpeed + speedChange;
      const released =
        0.5 * reducedMass * (approachSpeed * approachSpeed - remainingSpeed * remainingSpeed);

      store.thermalEnergy[i] += 0.5 * released;
      store.thermalEnergy[j] += 0.5 * released;
      heatReleased += released;
    }
  }

  return heatReleased;
}
