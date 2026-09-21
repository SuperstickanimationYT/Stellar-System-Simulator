import { OrbitCamera } from "./render/camera";
import { Renderer } from "./render/renderer";
import type { MergeRule } from "./sim/merging";
import { freeFallTime, particleMassOf } from "./sim/initialConditions";
import { defaultSettings, Simulation, type SimulationSettings } from "./sim/simulation";
import { Hud, requireElement } from "./ui/hud";

const canvas = requireElement<HTMLCanvasElement>("viewport");
const renderer = new Renderer(canvas);
const camera = new OrbitCamera(1.5 * defaultSettings.cloud.cloudRadius);
const hud = new Hud();

let settings: SimulationSettings = structuredClone(defaultSettings);
let simulation = new Simulation(settings);
let stepsPerFrame = 64;
let totalMerges = 0;
let running = true;

const runningButton = requireElement<HTMLButtonElement>("toggle-running");
const resetButton = requireElement<HTMLButtonElement>("reset");
const stepsInput = requireElement<HTMLInputElement>("steps-per-frame");
const stepsValue = requireElement("steps-per-frame-value");
const mergeRuleSelect = requireElement<HTMLSelectElement>("merge-rule");
const rotationInput = requireElement<HTMLInputElement>("rotation");
const rotationValue = requireElement("rotation-value");
const particleCountInput = requireElement<HTMLInputElement>("particle-count");
const particleCountValue = requireElement("particle-count-value");
const seedInput = requireElement<HTMLInputElement>("seed");
const seedValue = requireElement("seed-value");
const dissipationInput = requireElement<HTMLInputElement>("dissipation");
const dissipationValue = requireElement("dissipation-value");

function dissipationTimescaleFor(cloud: SimulationSettings["cloud"]): number {
  const multiple = Number(dissipationInput.value);
  return multiple <= 0 ? Infinity : multiple * freeFallTime(cloud);
}

function restart(): void {
  settings = structuredClone(defaultSettings);
  settings.mergeRule = mergeRuleSelect.value as MergeRule;
  settings.cloud.rotationalEnergyFraction = Number(rotationInput.value);
  settings.cloud.particleCount = Number(particleCountInput.value);
  settings.cloud.seed = Number(seedInput.value);
  settings.dissipation.timescale = dissipationTimescaleFor(settings.cloud);
  simulation = new Simulation(settings);
  totalMerges = 0;
}

function setRunning(next: boolean): void {
  running = next;
  runningButton.textContent = running ? "Pause" : "Resume";
}

runningButton.addEventListener("click", () => setRunning(!running));
resetButton.addEventListener("click", restart);

stepsInput.addEventListener("input", () => {
  stepsPerFrame = Number(stepsInput.value);
  stepsValue.textContent = stepsInput.value;
});

mergeRuleSelect.addEventListener("change", () => {
  simulation.settings.mergeRule = mergeRuleSelect.value as MergeRule;
});

rotationInput.addEventListener("input", () => {
  rotationValue.textContent = Number(rotationInput.value).toFixed(3);
});

particleCountInput.addEventListener("input", () => {
  particleCountValue.textContent = particleCountInput.value;
});

seedInput.addEventListener("input", () => {
  seedValue.textContent = seedInput.value;
});

dissipationInput.addEventListener("input", () => {
  const multiple = Number(dissipationInput.value);
  dissipationValue.textContent = multiple <= 0 ? "off" : `${multiple.toFixed(1)} t_ff`;
  simulation.settings.dissipation.timescale = dissipationTimescaleFor(simulation.settings.cloud);
});

let dragPointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;

canvas.addEventListener("pointerdown", (event) => {
  dragPointerId = event.pointerId;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("dragging");
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== dragPointerId) return;
  camera.orbitBy(
    (event.clientX - lastPointerX) * 0.006,
    (event.clientY - lastPointerY) * 0.006,
  );
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
});

function endDrag(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return;
  dragPointerId = null;
  canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove("dragging");
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera.zoomBy(Math.exp(event.deltaY * 0.0012));
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    setRunning(!running);
  } else if (event.key === "r" || event.key === "R") {
    restart();
  }
});

function frame(): void {
  if (running) {
    for (let i = 0; i < stepsPerFrame; i++) {
      totalMerges += simulation.step().mergeEvents;
    }
  }
  renderer.draw(simulation.store, camera, particleMassOf(simulation.settings.cloud));
  hud.update(simulation, totalMerges);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
