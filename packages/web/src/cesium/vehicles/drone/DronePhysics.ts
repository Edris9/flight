import * as Cesium from 'cesium';

export interface DroneInput {
  throttle: boolean;
  brake: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  altitudeUp: boolean;
  altitudeDown: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  targetSpeed?: number;
}

export interface DroneConfig {
  minSpeed: number;
  maxSpeed: number;
  speedChangeRate: number;
  turnRate: number;
  climbRate: number;
  hoverDamping: number; // How quickly drone stops (0-1, higher = quicker stop)
  tiltRate: number; // How quickly drone tilts
  maxTilt: number; // Maximum tilt angle
  strafeSpeed: number; // Sideways movement speed
}

export interface DroneState {
  speed: number;
  heading: number;
  pitch: number;
  roll: number;
  verticalVelocity: number;
}

export interface DroneUpdateResult {
  positionDelta: Cesium.Cartesian3;
  verticalDelta: number;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
}

export class DronePhysics {
  private currentSpeed: number;
  private targetSpeed: number;
  private heading: number;
  private pitch: number;
  private roll: number;
  private verticalVelocity: number;

  private static readonly scratchLocalForward = new Cesium.Cartesian3(1, 0, 0);
  private static readonly scratchPositionDelta = new Cesium.Cartesian3();

  constructor(private config: DroneConfig, initialHeading: number = 0) {
    this.currentSpeed = 0; // Drones can start at 0 speed (hovering)
    this.targetSpeed = 0;
    this.heading = initialHeading;
    this.pitch = 0;
    this.roll = 0;
    this.verticalVelocity = 0;
  }

  public update(deltaTime: number, input: DroneInput): DroneUpdateResult {
    // Speed control - drones can hover (0 speed)
    if (input.targetSpeed !== undefined) {
      this.targetSpeed = Math.max(0, Math.min(this.config.maxSpeed, input.targetSpeed));
    } else {
      const targetDelta = (input.throttle ? 1 : 0) - (input.brake ? 1 : 0);
      if (targetDelta !== 0) {
        this.targetSpeed += targetDelta * this.config.speedChangeRate * deltaTime;
      } else {
        // Apply hover damping - drone naturally slows down when no input
        this.targetSpeed *= (1 - this.config.hoverDamping * deltaTime);
      }
      this.targetSpeed = Math.max(0, Math.min(this.config.maxSpeed, this.targetSpeed));
    }

    // Smooth speed transition
    const speedDiff = this.targetSpeed - this.currentSpeed;
    const maxSpeedStep = this.config.speedChangeRate * deltaTime * 2; // Faster response for drones
    const speedStep = Cesium.Math.clamp(speedDiff, -maxSpeedStep, maxSpeedStep);
    this.currentSpeed += speedStep;

    // Roll/tilt control - drones tilt to turn and move
    let rollInput = 0;
    if (input.turnLeft || input.strafeLeft) rollInput -= 1;
    if (input.turnRight || input.strafeRight) rollInput += 1;

    const targetRoll = rollInput * this.config.maxTilt;
    this.roll = Cesium.Math.lerp(this.roll, targetRoll, this.config.tiltRate * deltaTime * 10);

    // Heading (yaw) control
    let turnInput = 0;
    if (input.turnLeft) turnInput -= 1;
    if (input.turnRight) turnInput += 1;

    // Drones can turn in place (unlike planes)
    this.heading = Cesium.Math.zeroToTwoPi(
      this.heading + turnInput * this.config.turnRate * deltaTime
    );

    // Vertical control - drones have precise vertical control
    let climbInput = 0;
    if (input.altitudeUp) climbInput += 1;
    if (input.altitudeDown) climbInput -= 1;

    const targetVerticalVelocity = climbInput * this.config.climbRate;

    // Fast vertical response for drones
    const vvLerp = 0.25; // Much more responsive than planes
    this.verticalVelocity = Cesium.Math.lerp(this.verticalVelocity, targetVerticalVelocity, vvLerp);

    // Drones have strong auto-stabilization (no gravity when hovering)
    if (climbInput === 0) {
      this.verticalVelocity *= (1 - this.config.hoverDamping * deltaTime * 3);
    }

    // Pitch control - drones pitch forward when moving forward
    let pitchInput = 0;
    if (input.throttle) pitchInput -= 1; // Pitch forward
    if (input.brake) pitchInput += 1; // Pitch back

    const targetPitch = pitchInput * this.config.maxTilt * 0.5; // Less pitch than roll
    this.pitch = Cesium.Math.lerp(this.pitch, targetPitch, this.config.tiltRate * deltaTime * 10);

    // Position delta (forward movement)
    const forwardStep = this.currentSpeed * deltaTime;
    const positionDelta = Cesium.Cartesian3.multiplyByScalar(
      DronePhysics.scratchLocalForward,
      forwardStep,
      DronePhysics.scratchPositionDelta
    );

    // Vertical delta
    const verticalDelta = this.verticalVelocity * deltaTime;

    return {
      positionDelta,
      verticalDelta,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.currentSpeed
    };
  }

  public getState(): DroneState {
    return {
      speed: this.currentSpeed,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
      verticalVelocity: this.verticalVelocity
    };
  }
}
