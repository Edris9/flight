import * as Cesium from 'cesium';
import { Vehicle, VehicleConfig } from '../Vehicle';
import { DronePhysics, DroneInput } from './DronePhysics';

interface DroneConfig extends VehicleConfig {
}

export class Drone extends Vehicle {
  private physics: DronePhysics;
  private input: DroneInput = {
    throttle: false,
    brake: false,
    turnLeft: false,
    turnRight: false,
    altitudeUp: false,
    altitudeDown: false,
    strafeLeft: false,
    strafeRight: false
  };
  private framesSinceCollisionCheck: number = 0;
  private crashed: boolean = false;

  private static readonly scratchTransform = new Cesium.Matrix4();
  private static readonly scratchWorldForward = new Cesium.Cartesian3();
  private static readonly scratchForwardWorldDelta = new Cesium.Cartesian3();
  private static readonly scratchENU = new Cesium.Matrix4();
  private static readonly scratchUpCol = new Cesium.Cartesian4();
  private static readonly scratchUp = new Cesium.Cartesian3();
  private static readonly scratchVerticalDeltaVec = new Cesium.Cartesian3();
  private static readonly scratchTotalDelta = new Cesium.Cartesian3();
  private static readonly scratchLocalForward = new Cesium.Cartesian3();
  private static readonly scratchWorldForwardCollision = new Cesium.Cartesian3();
  private static readonly scratchProbe = new Cesium.Cartesian3();
  private static readonly scratchScaled = new Cesium.Cartesian3();

  constructor(id: string, config: DroneConfig) {
    super(id, config);
    // Drone-specific physics configuration
    this.physics = new DronePhysics({
      minSpeed: 0,           // Can hover at 0 speed
      maxSpeed: 100,         // Max 100 m/s (~220 mph) - slower than aircraft
      speedChangeRate: 30,   // Fast acceleration
      turnRate: Cesium.Math.toRadians(120), // Very agile turning (120 deg/s)
      climbRate: 15,         // Fast vertical movement
      hoverDamping: 2.0,     // Quick stabilization
      tiltRate: 5.0,         // Fast tilt response
      maxTilt: Cesium.Math.toRadians(35), // Max 35 degree tilt
      strafeSpeed: 20        // Sideways movement speed
    }, this.hpRoll.heading);
  }

  protected onModelReady(): void {
    // Drones might have rotor animations
    if (this.primitive && this.primitive.activeAnimations) {
      this.primitive.activeAnimations.addAll({
        multiplier: 1.5, // Faster rotor speed
        loop: Cesium.ModelAnimationLoop.REPEAT
      });
    }
  }

  public update(deltaTime: number): void {
    if (!this.isReady || this.crashed || !this.physicsEnabled) return;

    const result = this.physics.update(deltaTime, this.input);

    this.hpRoll.heading = result.heading;
    this.hpRoll.pitch = result.pitch;
    this.hpRoll.roll = result.roll;

    if (this.primitive) {
      // Transform to world space
      Cesium.Transforms.headingPitchRollToFixedFrame(
        this.position,
        this.hpRoll,
        Cesium.Ellipsoid.WGS84,
        undefined,
        Drone.scratchTransform
      );

      // Forward movement
      const worldForward = Cesium.Matrix4.multiplyByPoint(
        Drone.scratchTransform,
        result.positionDelta,
        Drone.scratchWorldForward
      );
      const forwardWorldDelta = Cesium.Cartesian3.subtract(
        worldForward,
        this.position,
        Drone.scratchForwardWorldDelta
      );

      // Vertical movement
      Cesium.Transforms.eastNorthUpToFixedFrame(this.position, undefined, Drone.scratchENU);
      const upCol = Cesium.Matrix4.getColumn(Drone.scratchENU, 2, Drone.scratchUpCol);
      Cesium.Cartesian3.fromCartesian4(upCol, Drone.scratchUp);
      const verticalDeltaVec = Cesium.Cartesian3.multiplyByScalar(
        Drone.scratchUp,
        result.verticalDelta,
        Drone.scratchVerticalDeltaVec
      );

      // Total movement
      const totalDelta = Cesium.Cartesian3.add(
        forwardWorldDelta,
        verticalDeltaVec,
        Drone.scratchTotalDelta
      );
      this.position = Cesium.Cartesian3.add(this.position, totalDelta, this.position);
    }

    this.velocity = result.speed;
    this.speed = Math.abs(result.speed);

    // Collision check (less frequent for drones as they're more agile)
    this.framesSinceCollisionCheck++;
    if (this.framesSinceCollisionCheck >= 10) {
      this.framesSinceCollisionCheck = 0;
      this.performCollisionCheck();
    }

    this.updateModelMatrix();
  }

  private performCollisionCheck(): void {
    if (!this.primitive || !this.sceneRef) return;

    // Check ground collision
    const currentHeight = Cesium.Cartographic.fromCartesian(this.position).height;
    const ground = this.sceneRef.clampToHeight(this.position, [this.primitive]);
    if (ground) {
      const groundHeight = Cesium.Cartographic.fromCartesian(ground).height;
      if (currentHeight <= groundHeight + 0.3) { // Smaller margin for drones
        this.crash();
        return;
      }
    }

    // Forward collision check (smaller probe distance for drones)
    Cesium.Transforms.eastNorthUpToFixedFrame(this.position, undefined, Drone.scratchTransform);
    Drone.scratchLocalForward.x = Math.cos(this.hpRoll.heading);
    Drone.scratchLocalForward.y = -Math.sin(this.hpRoll.heading);
    Drone.scratchLocalForward.z = 0;

    const worldForward = Cesium.Matrix4.multiplyByPointAsVector(
      Drone.scratchTransform,
      Drone.scratchLocalForward,
      Drone.scratchWorldForwardCollision
    );
    Cesium.Cartesian3.normalize(worldForward, worldForward);

    const probeDistance = 1.5; // Shorter probe for more agile drone
    Cesium.Cartesian3.multiplyByScalar(worldForward, probeDistance, Drone.scratchScaled);
    const probe = Cesium.Cartesian3.add(
      this.position,
      Drone.scratchScaled,
      Drone.scratchProbe
    );
    const ahead = this.sceneRef.clampToHeight(probe, [this.primitive]);
    if (ahead) {
      const aheadHeight = Cesium.Cartographic.fromCartesian(ahead).height;
      const myHeight = Cesium.Cartographic.fromCartesian(this.position).height;
      if (aheadHeight > myHeight + 0.5) {
        this.crash();
      }
    }
  }

  private crash(): void {
    this.crashed = true;
    this.velocity = 0;
    this.speed = 0;
    console.log('🚁 Drone crashed');
  }

  public isCrashed(): boolean {
    return this.crashed;
  }

  public resetCrash(): void {
    this.crashed = false;
  }

  public setInput(input: Partial<DroneInput>): void {
    Object.assign(this.input, input);
  }
}
