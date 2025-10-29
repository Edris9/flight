import * as Cesium from 'cesium';

export interface MarkerOptions {
  position: Cesium.Cartesian3;
  name: string;
  color?: Cesium.Color;
  radius?: number;
  height?: number;
}

export class MarkerManager {
  private viewer: Cesium.Viewer;
  private markers: Cesium.Entity[] = [];
  private activeMarker: Cesium.Entity | null = null;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  addMarker(options: MarkerOptions): Cesium.Entity {
    const color = options.color || new Cesium.Color(1.0, 0.3, 0.3, 0.4); // Semi-transparent red
    const radius = options.radius || 500; // 500 meters default
    const height = options.height || 100; // 100 meters above ground

    // Remove previous active marker if exists
    if (this.activeMarker) {
      this.removeMarker(this.activeMarker);
    }

    // Create a pulsing circle on the ground
    const marker = this.viewer.entities.add({
      name: options.name,
      position: options.position,
      ellipse: {
        semiMinorAxis: radius,
        semiMajorAxis: radius,
        height: height,
        material: new Cesium.ColorMaterialProperty(color),
        outline: true,
        outlineColor: new Cesium.Color(1.0, 0.5, 0.0, 0.8), // Orange outline
        outlineWidth: 3,
      },
      // Add a vertical cylinder/beacon
      cylinder: {
        length: height * 2,
        topRadius: 50,
        bottomRadius: 50,
        material: new Cesium.Color(1.0, 0.5, 0.0, 0.3), // Semi-transparent orange
        outline: true,
        outlineColor: new Cesium.Color(1.0, 0.5, 0.0, 0.6),
        outlineWidth: 2,
      },
      // Add a label
      label: {
        text: options.name,
        font: '18px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -height - 50),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    this.markers.push(marker);
    this.activeMarker = marker;

    // Add pulsing animation
    this.addPulseAnimation(marker, radius);

    console.log(`Marker added at ${options.name}`);
    return marker;
  }

  private addPulseAnimation(marker: Cesium.Entity, baseRadius: number): void {
    const startTime = Cesium.JulianDate.now();
    const duration = 2.0; // 2 seconds per pulse

    const pulseCallback = () => {
      const currentTime = Cesium.JulianDate.now();
      const elapsedSeconds = Cesium.JulianDate.secondsDifference(currentTime, startTime);
      const phase = (elapsedSeconds % duration) / duration; // 0 to 1

      // Sine wave for smooth pulsing
      const scale = 1.0 + 0.2 * Math.sin(phase * Math.PI * 2);

      if (marker.ellipse) {
        marker.ellipse.semiMinorAxis = new Cesium.ConstantProperty(baseRadius * scale);
        marker.ellipse.semiMajorAxis = new Cesium.ConstantProperty(baseRadius * scale);
      }
    };

    // Store the interval so we can clear it later
    const interval = setInterval(pulseCallback, 50); // Update every 50ms
    (marker as any)._pulseInterval = interval;
  }

  removeMarker(marker: Cesium.Entity): void {
    // Clear pulse animation
    if ((marker as any)._pulseInterval) {
      clearInterval((marker as any)._pulseInterval);
    }

    this.viewer.entities.remove(marker);
    const index = this.markers.indexOf(marker);
    if (index > -1) {
      this.markers.splice(index, 1);
    }

    if (this.activeMarker === marker) {
      this.activeMarker = null;
    }
  }

  clearAllMarkers(): void {
    this.markers.forEach(marker => {
      if ((marker as any)._pulseInterval) {
        clearInterval((marker as any)._pulseInterval);
      }
      this.viewer.entities.remove(marker);
    });
    this.markers = [];
    this.activeMarker = null;
  }

  getActiveMarker(): Cesium.Entity | null {
    return this.activeMarker;
  }

  getAllMarkers(): Cesium.Entity[] {
    return [...this.markers];
  }
}
