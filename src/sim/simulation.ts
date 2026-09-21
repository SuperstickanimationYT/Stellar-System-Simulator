import { PARSEC, SOLAR_MASS } from "./constants";
import { measure, type Diagnostics } from "./diagnostics";
import { applyShockDissipation, type DissipationSettings } from "./dissipation";
import { accumulateGravitationalAcceleration } from "./gravity";
import {
  buildRotatingCloud,
  freeFallTime,
  meanDensityOf,
  type CloudSpec,
} from "./initialConditions";
import {
  mergeTouchingParticles,
  type MergeOutcome,
  type MergeRule,
  type SinkSettings,
} from "./merging";
import { ParticleKind, type ParticleStore } from "./particles";
import {
  accumulatePressureAcceleration,
  defaultGas,
  soundSpeedAt,
  updateGasState,
  type GasSettings,
} from "./pressure";

export interface SimulationSettings {
  cloud: CloudSpec;
  softeningLength: number;
  timestepSafety: number;
  minimumTimestep: number;
  maximumTimestep: number;
  mergeRule: MergeRule;
  dissipation: DissipationSettings;
  gas: GasSettings;
  sink: SinkSettings;
  courantSafety: number;
}

const defaultCloud: CloudSpec = {
  particleCount: 200,
  totalMass: SOLAR_MASS,
  cloudRadius: 0.01 * PARSEC,
  bulkDensity: 4e-9,
  rotationalEnergyFraction: 0.02,
  material: "H",
  seed: 42,
};

export const defaultSettings: SimulationSettings = {
  cloud: defaultCloud,
  softeningLength: 0,
  timestepSafety: 0.05,
  minimumTimestep: 1e4,
  maximumTimestep: 5e7,
  mergeRule: "momentum-conserving",
  dissipation: { timescale: Infinity, reach: 2.5 },
  gas: { ...defaultGas },
  sink: { enabled: true, density: 0, accretionFraction: 0.5 },
  courantSafety: 0.3,
};

export function resolutionLimitedSinkDensity(settings: SimulationSettings): number {
  return Math.min(settings.gas.opaqueDensity, 100 * meanDensityOf(settings.cloud));
}

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
    if (settings.sink.density <= 0) {
      settings.sink.density = resolutionLimitedSinkDensity(settings);
    }
    this.accumulateAccelerations();
    this.initialDiagnostics = this.measure();
  }

  private accumulateAccelerations(): void {
    const { gas, softeningLength } = this.settings;
    if (gas.enabled) updateGasState(this.store, gas);
    accumulateGravitationalAcceleration(this.store, softeningLength, gas.enabled);
    if (gas.enabled) accumulatePressureAcceleration(this.store);
  }

  measure(): Diagnostics {
    return measure(this.store, this.settings.softeningLength, this.settings.gas);
  }

  chooseTimestep(): number {
    const { store } = this;
    const { timestepSafety, minimumTimestep, maximumTimestep } = this.settings;
    let timestep = maximumTimestep;

    for (let i = 0; i < store.count; i++) {
      if (store.kind[i] !== ParticleKind.Matter) continue;

      const contactScale =
        this.settings.gas.enabled && store.smoothingLength[i] > 0
          ? store.smoothingLength[i]
          : store.radius[i];
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

      if (this.settings.gas.enabled) {
        const smoothing = store.smoothingLength[i];
        const signalSpeed = soundSpeedAt(store.density[i], this.settings.gas) + speed;
        if (smoothing > 0 && signalSpeed > 0) {
          const byCourant = (this.settings.courantSafety * smoothing) / signalSpeed;
          if (byCourant < timestep) timestep = byCourant;
        }
      }
    }

    return Math.max(timestep, minimumTimestep);
  }

  step(): StepReport {
    const { store } = this;
    const { mergeRule, dissipation, softeningLength, sink } = this.settings;
    const timestep = this.chooseTimestep();
    const halfStep = 0.5 * timestep;

    this.applyKick(halfStep);
    this.applyDrift(timestep);
    this.accumulateAccelerations();
    this.applyKick(halfStep);

    const dissipatedHeat = applyShockDissipation(store, timestep, dissipation);
    const outcome = mergeTouchingParticles(store, mergeRule, softeningLength, sink);
    if (outcome.mergeEvents > 0) this.accumulateAccelerations();

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
