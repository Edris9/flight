import * as Cesium from 'cesium';
import type { Drone } from '../vehicles/drone/Drone';

export interface NavigationTarget {
  position: Cesium.Cartesian3;
  name: string;
  speed?: 'slow' | 'medium' | 'fast' | 'very_fast'; // Speed presets
  speedKmh?: number; // Custom speed in km/h
}

export interface NavigationState {
  isNavigating: boolean;
  currentTarget: NavigationTarget | null;
  distanceToTarget: number;
  estimatedTimeRemaining: number; // seconds
  currentSpeedKmh: number;
}

export type NavigationCallback = (state: NavigationState) => void;

export class NavigationService {
  private drone: Drone | null = null;
  private isNavigating = false;
  private currentTarget: NavigationTarget | null = null;
  private onStatusChange?: NavigationCallback;
  private arrivalThreshold = 100; // meters - consider "arrived" when within this distance

  // Speed presets in km/h
  private readonly speedPresets = {
    slow: 50,      // 50 km/h
    medium: 150,   // 150 km/h
    fast: 300,     // 300 km/h
    very_fast: 500 // 500 km/h
  };

  constructor() {}

  public setDrone(drone: Drone): void {
    this.drone = drone;
  }

  public navigateTo(target: NavigationTarget): void {
    if (!this.drone) {
      console.error('❌ No drone set for navigation');
      return;
    }

    this.currentTarget = target;
    this.isNavigating = true;

    // Determine target speed
    const targetSpeedKmh = target.speedKmh ||
                          (target.speed ? this.speedPresets[target.speed] : this.speedPresets.medium);

    console.log(`🚁 Starting navigation to ${target.name}`);
    console.log(`   Target speed: ${targetSpeedKmh} km/h`);
    console.log(`   Position:`, target.position);

    this.notifyStatusChange();
  }

  public update(deltaTime: number): void {
    if (!this.isNavigating || !this.currentTarget || !this.drone) {
      return;
    }

    const droneState = this.drone.getState();
    const dronePos = droneState.position;
    const targetPos = this.currentTarget.position;

    // Calculate distance and direction
    const distanceMeters = Cesium.Cartesian3.distance(dronePos, targetPos);

    // Check if arrived
    if (distanceMeters < this.arrivalThreshold) {
      this.onArrival();
      return;
    }

    // Calculate direction to target (in ENU frame)
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(dronePos);
    const enuTransformInverse = Cesium.Matrix4.inverse(enuTransform, new Cesium.Matrix4());

    // Convert target to local ENU coordinates
    const targetInENU = Cesium.Matrix4.multiplyByPoint(
      enuTransformInverse,
      targetPos,
      new Cesium.Cartesian3()
    );

    // Calculate heading to target (in radians)
    const targetHeading = Math.atan2(targetInENU.x, targetInENU.y);

    // Current heading
    const currentHeading = droneState.heading;

    // Calculate heading difference (-PI to PI)
    let headingDiff = targetHeading - currentHeading;

    // Normalize to -PI to PI
    while (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
    while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;

    // Determine target speed based on distance (decelerate when close)
    const baseSpeedKmh = this.currentTarget.speedKmh ||
                        (this.currentTarget.speed ? this.speedPresets[this.currentTarget.speed] : this.speedPresets.medium);

    let targetSpeedMps: number;

    // Deceleration logic
    const decelerationDistance = 500; // Start slowing down 500m before target
    if (distanceMeters < decelerationDistance) {
      // Linear deceleration
      const slowdownFactor = distanceMeters / decelerationDistance;
      targetSpeedMps = (baseSpeedKmh / 3.6) * Math.max(0.3, slowdownFactor); // Minimum 30% speed
    } else {
      targetSpeedMps = baseSpeedKmh / 3.6; // Convert km/h to m/s
    }

    // Calculate altitude difference
    const currentHeight = Cesium.Cartographic.fromCartesian(dronePos).height;
    const targetHeight = Cesium.Cartographic.fromCartesian(targetPos).height;
    const heightDiff = targetHeight - currentHeight;

    // Simulate WASD input based on navigation needs
    const input: any = {
      throttle: false,
      brake: false,
      turnLeft: false,
      turnRight: false,
      altitudeUp: false,
      altitudeDown: false,
      targetSpeed: targetSpeedMps
    };

    // Heading control (turn towards target)
    const headingTolerance = Cesium.Math.toRadians(5); // 5 degrees
    if (Math.abs(headingDiff) > headingTolerance) {
      if (headingDiff > 0) {
        input.turnRight = true;
      } else {
        input.turnLeft = true;
      }
    }

    // Altitude control
    const altitudeTolerance = 10; // meters
    if (Math.abs(heightDiff) > altitudeTolerance) {
      if (heightDiff > 0) {
        input.altitudeUp = true;
      } else {
        input.altitudeDown = true;
      }
    }

    // Forward movement (only when roughly facing target)
    if (Math.abs(headingDiff) < Cesium.Math.toRadians(45)) {
      input.throttle = true;
    }

    // Apply input to drone
    this.drone.setInput(input);

    // Notify status change
    this.notifyStatusChange();
  }

  private onArrival(): void {
    if (!this.currentTarget) return;

    console.log(`✅ Arrived at ${this.currentTarget.name}`);

    this.isNavigating = false;

    // Stop the drone
    if (this.drone) {
      this.drone.setInput({
        throttle: false,
        brake: true,
        turnLeft: false,
        turnRight: false,
        altitudeUp: false,
        altitudeDown: false,
        targetSpeed: 0
      });
    }

    this.notifyStatusChange();
  }

  public stopNavigation(): void {
    console.log('🛑 Navigation stopped');
    this.isNavigating = false;
    this.currentTarget = null;

    if (this.drone) {
      this.drone.setInput({
        throttle: false,
        brake: true,
        targetSpeed: 0
      });
    }

    this.notifyStatusChange();
  }

  public getState(): NavigationState {
    if (!this.isNavigating || !this.currentTarget || !this.drone) {
      return {
        isNavigating: false,
        currentTarget: null,
        distanceToTarget: 0,
        estimatedTimeRemaining: 0,
        currentSpeedKmh: 0
      };
    }

    const droneState = this.drone.getState();
    const distance = Cesium.Cartesian3.distance(
      droneState.position,
      this.currentTarget.position
    );

    const speedMps = droneState.speed;
    const speedKmh = speedMps * 3.6;
    const eta = speedMps > 0 ? distance / speedMps : 0;

    return {
      isNavigating: this.isNavigating,
      currentTarget: this.currentTarget,
      distanceToTarget: distance,
      estimatedTimeRemaining: eta,
      currentSpeedKmh: speedKmh
    };
  }

  public setStatusCallback(callback: NavigationCallback): void {
    this.onStatusChange = callback;
  }

  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.getState());
    }
  }

  public isActive(): boolean {
    return this.isNavigating;
  }
}
