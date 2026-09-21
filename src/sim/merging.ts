import { GRAVITATIONAL_CONSTANT } from "./constants";
import { ELEMENT_COUNT } from "./elements";
import { ParticleKind, type ParticleStore } from "./particles";

export type MergeRule = "momentum-conserving" | "unweighted-average";

export interface SinkSettings {
  enabled: boolean;
  density: number;
  accretionFraction: number;
}

export const sinksDisabled: SinkSettings = {
  enabled: false,
  density: Infinity,
  accretionFraction: 0,
};

export interface MergeOutcome {
  mergeEvents: number;
  particlesAbsorbed: number;
  heatReleased: number;
  bindingEnergyAbsorbed: number;
}

class DisjointSets {
  private readonly parent: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }

  find(node: number): number {
    let root = node;
    while (this.parent[root] !== root) root = this.parent[root];
    let walker = node;
    while (this.parent[walker] !== root) {
      const next = this.parent[walker];
      this.parent[walker] = root;
      walker = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  }
}

function accretionRadii(store: ParticleStore, sink: SinkSettings): Float64Array {
  const radii = new Float64Array(store.count);
  for (let i = 0; i < store.count; i++) {
    const isCore =
      sink.enabled && store.smoothingLength[i] > 0 && store.density[i] >= sink.density;
    radii[i] = isCore
      ? Math.max(store.radius[i], sink.accretionFraction * store.smoothingLength[i])
      : store.radius[i];
  }
  return radii;
}

function groupTouchingParticles(
  store: ParticleStore,
  sink: SinkSettings,
): Map<number, number[]> | null {
  const { count, kind, positionX, positionY, positionZ } = store;
  const radius = accretionRadii(store, sink);
  const sets = new DisjointSets(count);
  let anyContact = false;

  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    for (let j = i + 1; j < count; j++) {
      if (kind[j] !== ParticleKind.Matter) continue;

      const dx = positionX[j] - positionX[i];
      const dy = positionY[j] - positionY[i];
      const dz = positionZ[j] - positionZ[i];
      const contactDistance = radius[i] + radius[j];

      if (dx * dx + dy * dy + dz * dz <= contactDistance * contactDistance) {
        sets.union(i, j);
        anyContact = true;
      }
    }
  }

  if (!anyContact) return null;

  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    if (kind[i] !== ParticleKind.Matter) continue;
    const root = sets.find(i);
    const members = groups.get(root);
    if (members) members.push(i);
    else groups.set(root, [i]);
  }
  return groups;
}

export function mergeTouchingParticles(
  store: ParticleStore,
  rule: MergeRule,
  softeningLength: number,
  sink: SinkSettings,
): MergeOutcome {
  const outcome: MergeOutcome = {
    mergeEvents: 0,
    particlesAbsorbed: 0,
    heatReleased: 0,
    bindingEnergyAbsorbed: 0,
  };
  const groups = groupTouchingParticles(store, sink);
  if (!groups) return outcome;

  const blendedComposition = new Float64Array(ELEMENT_COUNT);
  const absorbed: number[] = [];

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    const survivor = members[0];
    const useMassWeights = rule === "momentum-conserving";
    let totalMass = 0;
    let weightSum = 0;
    let positionX = 0;
    let positionY = 0;
    let positionZ = 0;
    let velocityX = 0;
    let velocityY = 0;
    let velocityZ = 0;
    let kineticBefore = 0;
    let thermalEnergy = 0;
    let bindingEnergy = pairPotentialEnergyWithin(store, members, softeningLength);
    blendedComposition.fill(0);

    for (const member of members) {
      const memberMass = store.mass[member];
      const weight = useMassWeights ? memberMass : 1;
      const vx = store.velocityX[member];
      const vy = store.velocityY[member];
      const vz = store.velocityZ[member];

      totalMass += memberMass;
      weightSum += weight;
      positionX += weight * store.positionX[member];
      positionY += weight * store.positionY[member];
      positionZ += weight * store.positionZ[member];
      velocityX += weight * vx;
      velocityY += weight * vy;
      velocityZ += weight * vz;
      kineticBefore += 0.5 * memberMass * (vx * vx + vy * vy + vz * vz);
      thermalEnergy += store.thermalEnergy[member];
      bindingEnergy += store.bindingEnergy[member];

      const memberOffset = member * ELEMENT_COUNT;
      for (let element = 0; element < ELEMENT_COUNT; element++) {
        blendedComposition[element] += weight * store.composition[memberOffset + element];
      }
    }

    positionX /= weightSum;
    positionY /= weightSum;
    positionZ /= weightSum;
    velocityX /= weightSum;
    velocityY /= weightSum;
    velocityZ /= weightSum;
    for (let element = 0; element < ELEMENT_COUNT; element++) {
      blendedComposition[element] /= weightSum;
    }

    const kineticAfter =
      0.5 * totalMass * (velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);
    const heat = Math.max(0, kineticBefore - kineticAfter);

    store.setMass(survivor, totalMass);
    store.positionX[survivor] = positionX;
    store.positionY[survivor] = positionY;
    store.positionZ[survivor] = positionZ;
    store.velocityX[survivor] = velocityX;
    store.velocityY[survivor] = velocityY;
    store.velocityZ[survivor] = velocityZ;
    store.thermalEnergy[survivor] = thermalEnergy + heat;
    store.bindingEnergy[survivor] = bindingEnergy;
    store.composition.set(blendedComposition, survivor * ELEMENT_COUNT);

    for (let member = 1; member < members.length; member++) absorbed.push(members[member]);

    outcome.mergeEvents++;
    outcome.particlesAbsorbed += members.length - 1;
    outcome.heatReleased += heat;
    outcome.bindingEnergyAbsorbed += bindingEnergy;
  }

  absorbed.sort((a, b) => b - a);
  for (const index of absorbed) store.removeByOverwritingWithLast(index);

  return outcome;
}

function pairPotentialEnergyWithin(
  store: ParticleStore,
  members: readonly number[],
  softeningLength: number,
): number {
  const softeningSquared = softeningLength * softeningLength;
  let energy = 0;

  for (let a = 0; a < members.length; a++) {
    const first = members[a];
    for (let b = a + 1; b < members.length; b++) {
      const second = members[b];
      const dx = store.positionX[second] - store.positionX[first];
      const dy = store.positionY[second] - store.positionY[first];
      const dz = store.positionZ[second] - store.positionZ[first];
      const separation = Math.sqrt(dx * dx + dy * dy + dz * dz + softeningSquared);
      if (separation === 0) continue;
      energy -= (GRAVITATIONAL_CONSTANT * store.mass[first] * store.mass[second]) / separation;
    }
  }

  return energy;
}
