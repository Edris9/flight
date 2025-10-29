import * as Cesium from 'cesium';
import type { Aircraft } from '../vehicles/aircraft/Aircraft';

export interface OrbitOptions {
  center: Cesium.Cartesian3;
  radius: number; // in meters
  altitude: number; // in meters
  speed: number; // in m/s
}

export class OrbitMode {
  private aircraft: Aircraft | null = null;
  private isActive = false;
  private orbitCenter: Cesium.Cartesian3 | null = null;
  private orbitRadius = 1000; // meters
  private orbitAltitude = 300; // meters
  private orbitSpeed = 50; // m/s
  private currentAngle = 0; // radians
  private updateCallback: ((deltaTime: number) => void) | null = null;

  constructor() {}

  startOrbit(aircraft: Aircraft, options: OrbitOptions): void {
    this.aircraft = aircraft;
    this.orbitCenter = options.center;
    this.orbitRadius = options.radius;
    this.orbitAltitude = options.altitude;
    this.orbitSpeed = options.speed;
    this.isActive = true;

    // Calculate starting angle based on current position
    const currentPos = aircraft.getState().position;
    const centerCarto = Cesium.Cartographic.fromCartesian(this.orbitCenter);
    const currentCarto = Cesium.Cartographic.fromCartesian(currentPos);

    // Calculate angle from center to current position
    const dx = currentCarto.longitude - centerCarto.longitude;
    const dy = currentCarto.latitude - centerCarto.latitude;
    this.currentAngle = Math.atan2(dy, dx);

    console.log(`🔄 Starting orbit mode around target at altitude ${this.orbitAltitude}m, radius ${this.orbitRadius}m`);

    // Setup update callback
    this.setupUpdate();
  }

  private setupUpdate(): void {
    this.updateCallback = (deltaTime: number) => {
      if (!this.isActive || !this.aircraft || !this.orbitCenter) {
        return;
      }

      // Calculate angular velocity (radians per second)
      const circumference = 2 * Math.PI * this.orbitRadius;
      const angularVelocity = (this.orbitSpeed / circumference) * 2 * Math.PI;

      // Update angle
      this.currentAngle += angularVelocity * deltaTime;
      if (this.currentAngle > 2 * Math.PI) {
        this.currentAngle -= 2 * Math.PI;
      }

      // Calculate new position
      const centerCarto = Cesium.Cartographic.fromCartesian(this.orbitCenter);

      // Convert radius to degrees (approximate)
      const radiusInDegrees = this.orbitRadius / 111320; // meters to degrees at equator

      const newLongitude = centerCarto.longitude + radiusInDegrees * Math.cos(this.currentAngle);
      const newLatitude = centerCarto.latitude + radiusInDegrees * Math.sin(this.currentAngle);

      const newPosition = Cesium.Cartesian3.fromRadians(
        newLongitude,
        newLatitude,
        this.orbitAltitude
      );

      // Calculate heading (tangent to circle)
      const heading = this.currentAngle + Math.PI / 2; // 90 degrees ahead

      // Update aircraft state
      const currentState = this.aircraft.getState();
      this.aircraft.setState({
        ...currentState,
        position: newPosition,
        heading: heading,
        pitch: 0,
        roll: Cesium.Math.toRadians(-15), // Bank slightly for realistic orbit
        speed: this.orbitSpeed,
        velocity: this.orbitSpeed,
      });
    };
  }

  update(deltaTime: number): void {
    if (this.updateCallback) {
      this.updateCallback(deltaTime);
    }
  }

  stopOrbit(): void {
    this.isActive = false;
    this.updateCallback = null;
    console.log('🛑 Orbit mode stopped');
  }

  isOrbitActive(): boolean {
    return this.isActive;
  }

  getOrbitCenter(): Cesium.Cartesian3 | null {
    return this.orbitCenter;
  }
}
