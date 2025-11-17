import * as Cesium from 'cesium';
import type { Drone } from '../vehicles/drone/Drone';
import { NavigationService, type NavigationTarget } from './NavigationService';
import { LocationService } from './LocationService';
import { MarkerManager } from './MarkerManager';
import { OrbitMode } from '../modes/OrbitMode';

export type CommandType = 'navigate' | 'orbit' | 'scan' | 'wait' | 'hover';

export interface DroneCommand {
  type: CommandType;
  location?: string; // Location name for navigate/orbit
  position?: Cesium.Cartesian3; // Explicit position
  speed?: 'slow' | 'medium' | 'fast' | 'very_fast';
  duration?: number; // Duration in seconds for orbit/scan/wait
}

export interface CommandQueueState {
  isExecuting: boolean;
  currentCommand: DroneCommand | null;
  queueLength: number;
  commandIndex: number;
}

export type CommandQueueCallback = (state: CommandQueueState) => void;

export class CommandQueueService {
  private drone: Drone | null = null;
  private queue: DroneCommand[] = [];
  private currentCommand: DroneCommand | null = null;
  private isExecuting = false;
  private commandStartTime = 0;

  private navigationService: NavigationService;
  private locationService: LocationService;
  private markerManager: MarkerManager;
  private orbitMode: OrbitMode;

  private onStatusChange?: CommandQueueCallback;

  constructor(
    navigationService: NavigationService,
    locationService: LocationService,
    markerManager: MarkerManager,
    orbitMode: OrbitMode
  ) {
    this.navigationService = navigationService;
    this.locationService = locationService;
    this.markerManager = markerManager;
    this.orbitMode = orbitMode;
  }

  public setDrone(drone: Drone): void {
    this.drone = drone;
    this.navigationService.setDrone(drone);
  }

  public async addCommands(commands: DroneCommand[]): Promise<void> {
    console.log(`📋 Adding ${commands.length} commands to queue`);
    this.queue.push(...commands);
    this.notifyStatusChange();

    // Start executing if not already running
    if (!this.isExecuting) {
      await this.executeNext();
    }
  }

  public clearQueue(): void {
    console.log('🗑️ Clearing command queue');
    this.queue = [];
    this.currentCommand = null;
    this.isExecuting = false;
    this.navigationService.stopNavigation();
    this.orbitMode.stopOrbit();
    this.notifyStatusChange();
  }

  private async executeNext(): Promise<void> {
    if (this.queue.length === 0) {
      console.log('✅ All commands completed');
      this.isExecuting = false;
      this.currentCommand = null;
      this.notifyStatusChange();
      return;
    }

    this.currentCommand = this.queue.shift()!;
    this.isExecuting = true;
    this.commandStartTime = performance.now() / 1000;
    this.notifyStatusChange();

    console.log(`▶️ Executing command:`, this.currentCommand);

    try {
      await this.executeCommand(this.currentCommand);
    } catch (error) {
      console.error('❌ Command execution failed:', error);
    }

    // Move to next command
    await this.executeNext();
  }

  private async executeCommand(command: DroneCommand): Promise<void> {
    switch (command.type) {
      case 'navigate':
        await this.executeNavigate(command);
        break;

      case 'orbit':
      case 'scan':
        await this.executeOrbit(command);
        break;

      case 'wait':
      case 'hover':
        await this.executeWait(command);
        break;

      default:
        console.warn('Unknown command type:', command.type);
    }
  }

  private async executeNavigate(command: DroneCommand): Promise<void> {
    if (!this.drone) {
      throw new Error('No drone set');
    }

    let targetPosition: Cesium.Cartesian3;
    let locationName: string;

    if (command.position) {
      targetPosition = command.position;
      locationName = 'Target Location';
    } else if (command.location) {
      // Search for location
      console.log(`🔍 Searching for: ${command.location}`);
      const result = await this.locationService.searchLocation(command.location);

      if (!result) {
        throw new Error(`Could not find location: ${command.location}`);
      }

      targetPosition = Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 150);
      locationName = result.display_name;

      console.log(`✅ Found: ${locationName}`);

      // Add marker
      this.markerManager.addMarker({
        position: targetPosition,
        name: locationName,
        radius: 500,
        height: 50
      });
    } else {
      throw new Error('Navigate command requires location or position');
    }

    // Start navigation
    const target: NavigationTarget = {
      position: targetPosition,
      name: locationName,
      speed: command.speed || 'medium'
    };

    this.navigationService.navigateTo(target);

    // Wait for arrival
    await this.waitForNavigation();
  }

  private async waitForNavigation(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.navigationService.isActive()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  private async executeOrbit(command: DroneCommand): Promise<void> {
    if (!this.drone) {
      throw new Error('No drone set');
    }

    const duration = command.duration || 60; // Default 1 minute
    const currentPos = this.drone.getState().position;

    console.log(`🔄 Starting orbit for ${duration} seconds`);

    this.orbitMode.startOrbit(this.drone, {
      center: currentPos,
      radius: 800,
      altitude: Cesium.Cartographic.fromCartesian(currentPos).height,
      speed: 30 // 30 m/s for scanning
    });

    // Wait for duration
    await this.wait(duration);

    this.orbitMode.stopOrbit();
    console.log(`✅ Orbit completed`);
  }

  private async executeWait(command: DroneCommand): Promise<void> {
    const duration = command.duration || 10; // Default 10 seconds
    console.log(`⏸️ Waiting for ${duration} seconds`);

    // Make sure drone is hovering
    if (this.drone) {
      this.drone.setInput({
        throttle: false,
        brake: true,
        targetSpeed: 0
      });
    }

    await this.wait(duration);
    console.log(`✅ Wait completed`);
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, seconds * 1000);
    });
  }

  public update(deltaTime: number): void {
    if (!this.isExecuting || !this.currentCommand) {
      return;
    }

    // Update navigation service (for navigate commands)
    if (this.currentCommand.type === 'navigate') {
      this.navigationService.update(deltaTime);
    }

    // Update orbit mode (for orbit/scan commands)
    if (this.currentCommand.type === 'orbit' || this.currentCommand.type === 'scan') {
      this.orbitMode.update(deltaTime);
    }
  }

  public getState(): CommandQueueState {
    return {
      isExecuting: this.isExecuting,
      currentCommand: this.currentCommand,
      queueLength: this.queue.length,
      commandIndex: this.queue.length > 0 ? this.queue.length - 1 : 0
    };
  }

  public setStatusCallback(callback: CommandQueueCallback): void {
    this.onStatusChange = callback;
  }

  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.getState());
    }
  }
}
