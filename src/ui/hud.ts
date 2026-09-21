import { EARTH_MASS, JUPITER_MASS, SECONDS_PER_YEAR, SOLAR_MASS } from "../sim/constants";
import type { Simulation } from "../sim/simulation";

export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function formatDuration(seconds: number): string {
  const years = seconds / SECONDS_PER_YEAR;
  if (years < 1000) return `${years.toPrecision(3)} yr`;
  if (years < 1e6) return `${(years / 1e3).toPrecision(3)} kyr`;
  return `${(years / 1e6).toPrecision(3)} Myr`;
}

export function formatMass(kilograms: number): string {
  if (kilograms < JUPITER_MASS) return `${(kilograms / EARTH_MASS).toPrecision(3)} M⊕`;
  if (kilograms < 0.05 * SOLAR_MASS) return `${(kilograms / JUPITER_MASS).toPrecision(3)} M♃`;
  return `${(kilograms / SOLAR_MASS).toPrecision(3)} M☉`;
}

function formatSignedPercent(fraction: number): string {
  const percent = fraction * 100;
  const sign = percent >= 0 ? "+" : "−";
  return `${sign}${Math.abs(percent).toPrecision(3)}%`;
}

export class Hud {
  private readonly time = requireElement("readout-time");
  private readonly freefall = requireElement("readout-freefall");
  private readonly count = requireElement("readout-count");
  private readonly largest = requireElement("readout-largest");
  private readonly mass = requireElement("readout-mass");
  private readonly merges = requireElement("readout-merges");
  private readonly flattening = requireElement("readout-flattening");
  private readonly heat = requireElement("readout-heat");
  private readonly timestep = requireElement("readout-timestep");
  private readonly energy = requireElement("readout-energy");
  private readonly angular = requireElement("readout-angular");

  update(simulation: Simulation, totalMerges: number): void {
    const now = simulation.measure();
    const start = simulation.initialDiagnostics;

    this.time.textContent = formatDuration(simulation.elapsedTime);
    this.freefall.textContent = (simulation.elapsedTime / simulation.freeFallTime).toFixed(2);
    this.count.textContent = String(now.matterCount);
    this.largest.textContent = formatMass(now.largestMass);
    this.mass.textContent = formatMass(now.totalMass);
    this.merges.textContent = String(totalMerges);
    this.timestep.textContent = formatDuration(simulation.lastTimestep);

    this.flattening.textContent = Number.isFinite(now.flattening)
      ? `${now.flattening.toFixed(2)} : 1`
      : "flat";

    this.heat.textContent =
      start.potentialEnergy === 0
        ? "n/a"
        : (now.thermalEnergy / Math.abs(start.potentialEnergy)).toFixed(3);

    this.energy.textContent =
      start.totalEnergy === 0
        ? "n/a"
        : formatSignedPercent((now.totalEnergy - start.totalEnergy) / Math.abs(start.totalEnergy));

    this.angular.textContent =
      start.angularMomentumMagnitude === 0
        ? "n/a"
        : (now.angularMomentumMagnitude / start.angularMomentumMagnitude).toPrecision(4);
  }
}
