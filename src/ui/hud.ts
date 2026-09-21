import { EARTH_MASS, SECONDS_PER_YEAR } from "../sim/constants";
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

function formatEarthMasses(kilograms: number): string {
  const earths = kilograms / EARTH_MASS;
  if (earths < 1000) return `${earths.toPrecision(3)} M⊕`;
  return `${(earths / 1000).toPrecision(3)}k M⊕`;
}

function formatSignedPercent(fraction: number): string {
  const percent = fraction * 100;
  const sign = percent >= 0 ? "+" : "−";
  return `${sign}${Math.abs(percent).toPrecision(3)}%`;
}

export class Hud {
  private readonly time = requireElement("readout-time");
  private readonly count = requireElement("readout-count");
  private readonly largest = requireElement("readout-largest");
  private readonly mass = requireElement("readout-mass");
  private readonly merges = requireElement("readout-merges");
  private readonly timestep = requireElement("readout-timestep");
  private readonly energy = requireElement("readout-energy");
  private readonly angular = requireElement("readout-angular");

  update(simulation: Simulation, totalMerges: number): void {
    const now = simulation.measure();
    const start = simulation.initialDiagnostics;

    this.time.textContent = formatDuration(simulation.elapsedTime);
    this.count.textContent = String(now.matterCount);
    this.largest.textContent = formatEarthMasses(now.largestMass);
    this.mass.textContent = formatEarthMasses(now.totalMass);
    this.merges.textContent = String(totalMerges);
    this.timestep.textContent = formatDuration(simulation.lastTimestep);

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
