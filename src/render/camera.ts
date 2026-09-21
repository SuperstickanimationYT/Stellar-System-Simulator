export class OrbitCamera {
  yaw = 0.6;
  pitch = 0.4;

  rightX = 0;
  rightY = 0;
  rightZ = 0;
  upX = 0;
  upY = 0;
  upZ = 0;
  forwardX = 0;
  forwardY = 0;
  forwardZ = 0;

  constructor(public viewRadius: number) {
    this.refreshBasis();
  }

  refreshBasis(): void {
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    this.forwardX = cosPitch * sinYaw;
    this.forwardY = sinPitch;
    this.forwardZ = cosPitch * cosYaw;

    this.rightX = cosYaw;
    this.rightY = 0;
    this.rightZ = -sinYaw;

    this.upX = -sinYaw * sinPitch;
    this.upY = cosPitch;
    this.upZ = -cosYaw * sinPitch;
  }

  orbitBy(yawDelta: number, pitchDelta: number): void {
    const limit = Math.PI / 2 - 0.01;
    this.yaw += yawDelta;
    this.pitch = Math.min(limit, Math.max(-limit, this.pitch + pitchDelta));
    this.refreshBasis();
  }

  zoomBy(factor: number): void {
    this.viewRadius = Math.min(1e17, Math.max(1e9, this.viewRadius * factor));
  }

  pixelsPerMetre(width: number, height: number): number {
    return Math.min(width, height) / 2 / this.viewRadius;
  }
}
