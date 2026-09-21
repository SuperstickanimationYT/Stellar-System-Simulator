import { ASTRONOMICAL_UNIT } from "../sim/constants";
import { ParticleKind, type ParticleStore } from "../sim/particles";
import type { OrbitCamera } from "./camera";
import { swatchForMassRatio } from "./palette";

const MINIMUM_DRAWN_RADIUS = 1.7;
const HALO_THRESHOLD_PIXELS = 2.2;

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private drawOrder: number[] = [];
  private depths = new Float64Array(0);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D context unavailable");
    this.context = context;
  }

  resizeToDisplaySize(): { width: number; height: number } {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return { width, height };
  }

  draw(store: ParticleStore, camera: OrbitCamera, referenceMass: number): void {
    const { width, height } = this.resizeToDisplaySize();
    const context = this.context;

    context.fillStyle = "#05070d";
    context.fillRect(0, 0, width, height);

    const ratio = window.devicePixelRatio || 1;
    const scale = camera.pixelsPerMetre(width, height);
    const centreX = width / 2;
    const centreY = height / 2;

    if (this.depths.length < store.count) this.depths = new Float64Array(store.count * 2);
    this.drawOrder.length = 0;

    for (let i = 0; i < store.count; i++) {
      if (store.kind[i] !== ParticleKind.Matter) continue;
      this.depths[i] =
        store.positionX[i] * camera.forwardX +
        store.positionY[i] * camera.forwardY +
        store.positionZ[i] * camera.forwardZ;
      this.drawOrder.push(i);
    }

    this.drawOrder.sort((a, b) => this.depths[b] - this.depths[a]);

    for (const index of this.drawOrder) {
      const x = store.positionX[index];
      const y = store.positionY[index];
      const z = store.positionZ[index];

      const screenX = centreX + (x * camera.rightX + y * camera.rightY + z * camera.rightZ) * scale;
      const screenY = centreY - (x * camera.upX + y * camera.upY + z * camera.upZ) * scale;
      const drawnRadius = Math.max(MINIMUM_DRAWN_RADIUS * ratio, store.radius[index] * scale);

      if (
        screenX + drawnRadius < 0 ||
        screenX - drawnRadius > width ||
        screenY + drawnRadius < 0 ||
        screenY - drawnRadius > height
      ) {
        continue;
      }

      const swatch = swatchForMassRatio(store.mass[index] / referenceMass);

      if (drawnRadius > HALO_THRESHOLD_PIXELS * ratio) {
        context.globalAlpha = 0.14;
        context.fillStyle = swatch;
        context.beginPath();
        context.arc(screenX, screenY, drawnRadius * 2.6, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }

      context.fillStyle = swatch;
      context.beginPath();
      context.arc(screenX, screenY, drawnRadius, 0, Math.PI * 2);
      context.fill();
    }

    this.drawScaleBar(width, height, scale, ratio);
  }

  private drawScaleBar(width: number, height: number, scale: number, ratio: number): void {
    const context = this.context;
    const targetPixels = Math.min(width, height) * 0.2;
    const rawAstronomicalUnits = targetPixels / scale / ASTRONOMICAL_UNIT;
    const magnitude = 10 ** Math.floor(Math.log10(rawAstronomicalUnits));
    const steps = [1, 2, 5, 10];
    const chosen =
      (steps.find((step) => step * magnitude >= rawAstronomicalUnits * 0.5) ?? 1) * magnitude;
    const barPixels = chosen * ASTRONOMICAL_UNIT * scale;

    const margin = 18 * ratio;
    const baseline = height - margin;

    context.strokeStyle = "rgba(200, 215, 240, 0.65)";
    context.fillStyle = "rgba(200, 215, 240, 0.8)";
    context.lineWidth = 1.5 * ratio;
    context.beginPath();
    context.moveTo(margin, baseline);
    context.lineTo(margin + barPixels, baseline);
    context.moveTo(margin, baseline - 5 * ratio);
    context.lineTo(margin, baseline + 5 * ratio);
    context.moveTo(margin + barPixels, baseline - 5 * ratio);
    context.lineTo(margin + barPixels, baseline + 5 * ratio);
    context.stroke();

    context.font = `${12 * ratio}px ui-monospace, monospace`;
    context.textBaseline = "bottom";
    context.fillText(`${formatAstronomicalUnits(chosen)} AU`, margin, baseline - 8 * ratio);
  }
}

function formatAstronomicalUnits(value: number): string {
  if (value >= 1) return value.toLocaleString("en-US");
  return value.toPrecision(2);
}
