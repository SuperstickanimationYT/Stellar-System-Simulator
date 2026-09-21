import { PARSEC, SOLAR_MASS } from "./constants";
import { measure, type Diagnostics } from "./diagnostics";
import { applyShockDissipation, type DissipationSettings } from "./dissipation";
import { accumulateGravitationalAcceleration } from "./gravity";
import { buildRotatingCloud, freeFallTime, type CloudSpec } from "./initialConditions";
import { mergeTouchingParticles, type MergeOutcome, type MergeRule } from "./merging";
import { ParticleKind, type ParticleStore } from "./particles";

export interface SimulationSettings {
  cloud: CloudSpec;
  softeningLength: number;
  timestepSafety: number;
  minimumTimestep: number;
  maximumTimestep: number;
  mergeRule: MergeRule;
  dissipation: DissipationSettings;
}

const defaultCloud: CloudSpec = {
  particleCount: 100,
  totalMass: SOLAR_MASS,
  cloudRadius: 0.1 * PARSEC,
  bulkDensity: 4e-9,
  rotationalEnergyFraction: 0.02,
  material: "H",
  seed: 42,
};

export const defaultSettings: SimulationSettings = {
  cloud: defaultCloud,
  softeningLength: 0,
  timestepSafety: 0.05,
  minimumTimestep: 5e5,
  maximumTimestep: 1e9,
  mergeRule: "momentum-conserving",
  dissipation: { timescale: Infinity, reach: 2.5 },
};

export interface StepReport extends MergeOutcome {
  timestep: number;
  dissipatedHeat: number;
}

export class Simulation {
  store: ParticleStore;
  elapsedTime = 0;
  stepsTaken = 0;
  lastTimestep = 0;
  readonly freeFallTime: number;
  readonly initialDiagnostics: Diagnostics;

  constructor(readonly settings: SimulationSettings) {
    this.store = buildRotatingCloud(settings.cloud);
    this.freeFallTime = freeFallTime(settings.cloud);
    accumulateGravitationalAcceleration(this.store, settings.softeningLength);
    this.initialDiagnostics = this.measure();
  }

  measure(): Diagnostics {
    return measure(this.store, this.settings.softeningLength);
  }

  chooseTimestep(): number {
    const { store } = this;
    const { timestepSafety, minimumTimestep, maximumTimestep } = this.settings;
    let timestep = maximumTimestep;

    for (let i = 0; i < store.count; i++) {
      if (store.kind[i] !== ParticleKind.Matter) continue;

      const contactScale = store.radius[i];
      const acceleration = Math.hypot(
        store.accelerationX[i],
        store.accelerationY[i],
        store.accelerationZ[i],
      );
      if (acceleration > 0) {
        const byAcceleration = timestepSafety * Math.sqrt(contactScale / acceleration);
        if (byAcceleration < timestep) timestep = byAcceleration;
      }

      const speed = Math.hypot(store.velocityX[i], store.velocityY[i], store.velocityZ[i]);
      if (speed > 0) {
        const byTravel = (timestepSafety * contactScale) / speed;
        if (byTravel < timestep) timestep = byTravel;
      }
    }

    return Math.max(timestep, minimumTimestep);
  }

  step(): StepReport {
    const { store } = this;
    const { softeningLength, mergeRule, dissipation } = this.settings;
    const timestep = this.chooseTimestep();
    const halfStep = 0.5 * timestep;

    this.applyKick(halfStep);
    this.applyDrift(timestep);
    accumulateGravitationalAcceleration(store, softeningLength);
    this.applyKick(halfStep);

    const dissipatedHeat = applyShockDissipation(store, timestep, dissipation);
    const outcome = mergeTouchingParticles(store, mergeRule, softeningLength);
    if (outcome.mergeEvents > 0) accumulateGravitationalAcceleration(store, softeningLength);

    this.elapsedTime += timestep;
    this.stepsTaken++;
    this.lastTimestep = timestep;

    return { ...outcome, timestep, dissipatedHeat };
  }

  private applyKick(halfStep: number): void {
    const { store } = this;
    for (let i = 0; i < store.count; i++) {
      if (store.kind[i] !== ParticleKind.Matter) continue;
      store.velocityX[i] += store.accelerationX[i] * halfStep;
      store.velocityY[i] += store.accelerationY[i] * halfStep;
      store.velocityZ[i] += store.accelerationZ[i] * halfStep;
    }
  }

  private applyDrift(timestep: number): void {
    const { store } = this;
    for (let i = 0; i < store.count; i++) {
      store.positionX[i] += store.velocityX[i] * timestep;
      store.positionY[i] += store.velocityY[i] * timestep;
      store.positionZ[i] += store.velocityZ[i] * timestep;
    }
  }
}
