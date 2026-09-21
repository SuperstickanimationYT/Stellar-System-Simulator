import { GRAVITATIONAL_CONSTANT } from "./constants";
import { ParticleKind, type ParticleStore } from "./particles";

export function accumulateGravitationalAcceleration(
  store: ParticleStore,
  softeningLength: number,
): void {
  const {
    count,
    kind,
    mass,
    positionX,
    positionY,
    positionZ,
    accelerationX,
    accelerationY,
    accelerationZ,
  } = store;

  accelerationX.fill(0, 0, count);
  accelerationY.fill(0, 0, count);
  accelerationZ.fill(0, 0, count);

  const softeningSquared = softeningLength * softeningLength;

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    const xi = positionX[i];
    const yi = positionY[i];
    const zi = positionZ[i];
    const mi = mass[i];

    for (let j = i + 1; j < count; j++) {
      if (kind[j] !== ParticleKind.Matter) continue;

      const dx = positionX[j] - xi;
      const dy = positionY[j] - yi;
      const dz = positionZ[j] - zi;

      const separationSquared = dx * dx + dy * dy + dz * dz + softeningSquared;
      if (separationSquared === 0) continue;

      const inverseCube =
        GRAVITATIONAL_CONSTANT / (separationSquared * Math.sqrt(separationSquared));
      const towardsJ = inverseCube * mass[j];
      const towardsI = inverseCube * mi;

      accelerationX[i] += dx * towardsJ;
      accelerationY[i] += dy * towardsJ;
      accelerationZ[i] += dz * towardsJ;

      accelerationX[j] -= dx * towardsI;
      accelerationY[j] -= dy * towardsI;
      accelerationZ[j] -= dz * towardsI;
    }
  }
}
