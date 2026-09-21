import { ELEMENT_COUNT } from "./elements";

export const ParticleKind = { Matter: 0, Photon: 1 } as const;

export type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export interface ParticleSpec {
  kind?: ParticleKind;
  mass: number;
  position: readonly [number, number, number];
  velocity: readonly [number, number, number];
  composition?: Float64Array;
  thermalEnergy?: number;
  bindingEnergy?: number;
}

export class ParticleStore {
  count = 0;
  private capacity: number;
  private nextIdentifier = 1;

  kind: Uint8Array;
  identifier: Uint32Array;
  mass: Float64Array;
  radius: Float64Array;
  thermalEnergy: Float64Array;
  bindingEnergy: Float64Array;
  positionX: Float64Array;
  positionY: Float64Array;
  positionZ: Float64Array;
  velocityX: Float64Array;
  velocityY: Float64Array;
  velocityZ: Float64Array;
  accelerationX: Float64Array;
  accelerationY: Float64Array;
  accelerationZ: Float64Array;
  composition: Float64Array;

  constructor(
    readonly bulkDensity: number,
    initialCapacity = 256,
  ) {
    this.capacity = Math.max(1, initialCapacity);
    this.kind = new Uint8Array(this.capacity);
    this.identifier = new Uint32Array(this.capacity);
    this.mass = new Float64Array(this.capacity);
    this.radius = new Float64Array(this.capacity);
    this.thermalEnergy = new Float64Array(this.capacity);
    this.bindingEnergy = new Float64Array(this.capacity);
    this.positionX = new Float64Array(this.capacity);
    this.positionY = new Float64Array(this.capacity);
    this.positionZ = new Float64Array(this.capacity);
    this.velocityX = new Float64Array(this.capacity);
    this.velocityY = new Float64Array(this.capacity);
    this.velocityZ = new Float64Array(this.capacity);
    this.accelerationX = new Float64Array(this.capacity);
    this.accelerationY = new Float64Array(this.capacity);
    this.accelerationZ = new Float64Array(this.capacity);
    this.composition = new Float64Array(this.capacity * ELEMENT_COUNT);
  }

  radiusForMass(mass: number): number {
    return Math.cbrt((3 * mass) / (4 * Math.PI * this.bulkDensity));
  }

  add(spec: ParticleSpec): number {
    if (this.count === this.capacity) this.grow();
    const index = this.count++;
    const kind = spec.kind ?? ParticleKind.Matter;

    this.kind[index] = kind;
    this.identifier[index] = this.nextIdentifier++;
    this.mass[index] = spec.mass;
    this.radius[index] = kind === ParticleKind.Matter ? this.radiusForMass(spec.mass) : 0;
    this.thermalEnergy[index] = spec.thermalEnergy ?? 0;
    this.bindingEnergy[index] = spec.bindingEnergy ?? 0;
    this.positionX[index] = spec.position[0];
    this.positionY[index] = spec.position[1];
    this.positionZ[index] = spec.position[2];
    this.velocityX[index] = spec.velocity[0];
    this.velocityY[index] = spec.velocity[1];
    this.velocityZ[index] = spec.velocity[2];
    this.accelerationX[index] = 0;
    this.accelerationY[index] = 0;
    this.accelerationZ[index] = 0;

    const compositionOffset = index * ELEMENT_COUNT;
    this.composition.fill(0, compositionOffset, compositionOffset + ELEMENT_COUNT);
    if (spec.composition) this.composition.set(spec.composition, compositionOffset);

    return index;
  }

  setMass(index: number, mass: number): void {
    this.mass[index] = mass;
    if (this.kind[index] === ParticleKind.Matter) this.radius[index] = this.radiusForMass(mass);
  }

  compositionView(index: number): Float64Array {
    const offset = index * ELEMENT_COUNT;
    return this.composition.subarray(offset, offset + ELEMENT_COUNT);
  }

  removeByOverwritingWithLast(index: number): void {
    const last = --this.count;
    if (index !== last) this.copyRow(last, index);
  }

  private copyRow(from: number, to: number): void {
    this.kind[to] = this.kind[from];
    this.identifier[to] = this.identifier[from];
    this.mass[to] = this.mass[from];
    this.radius[to] = this.radius[from];
    this.thermalEnergy[to] = this.thermalEnergy[from];
    this.bindingEnergy[to] = this.bindingEnergy[from];
    this.positionX[to] = this.positionX[from];
    this.positionY[to] = this.positionY[from];
    this.positionZ[to] = this.positionZ[from];
    this.velocityX[to] = this.velocityX[from];
    this.velocityY[to] = this.velocityY[from];
    this.velocityZ[to] = this.velocityZ[from];
    this.accelerationX[to] = this.accelerationX[from];
    this.accelerationY[to] = this.accelerationY[from];
    this.accelerationZ[to] = this.accelerationZ[from];
    this.composition.copyWithin(to * ELEMENT_COUNT, from * ELEMENT_COUNT, (from + 1) * ELEMENT_COUNT);
  }

  private grow(): void {
    const grown = this.capacity * 2;
    const widen = (source: Float64Array) => {
      const target = new Float64Array(grown);
      target.set(source);
      return target;
    };

    const grownKind = new Uint8Array(grown);
    grownKind.set(this.kind);
    this.kind = grownKind;

    const grownIdentifier = new Uint32Array(grown);
    grownIdentifier.set(this.identifier);
    this.identifier = grownIdentifier;

    this.mass = widen(this.mass);
    this.radius = widen(this.radius);
    this.thermalEnergy = widen(this.thermalEnergy);
    this.bindingEnergy = widen(this.bindingEnergy);
    this.positionX = widen(this.positionX);
    this.positionY = widen(this.positionY);
    this.positionZ = widen(this.positionZ);
    this.velocityX = widen(this.velocityX);
    this.velocityY = widen(this.velocityY);
    this.velocityZ = widen(this.velocityZ);
    this.accelerationX = widen(this.accelerationX);
    this.accelerationY = widen(this.accelerationY);
    this.accelerationZ = widen(this.accelerationZ);

    const grownComposition = new Float64Array(grown * ELEMENT_COUNT);
    grownComposition.set(this.composition);
    this.composition = grownComposition;

    this.capacity = grown;
  }
}
