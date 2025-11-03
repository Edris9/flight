import * as Cesium from 'cesium';
import { Scene } from '../core/Scene';
import { GameLoop } from '../core/GameLoop';
import { VehicleManager } from '../managers/VehicleManager';
import { CameraManager } from '../managers/CameraManager';
import { InputManager } from '../input/InputManager';
import { ObjectManager } from '../builder/ObjectManager';
import { PlacementController } from '../builder/PlacementController';
import { TouchInputManager } from '../input/TouchInputManager';
import { VoiceInputManager } from '../input/VoiceInputManager';
import { LocationService } from '../services/LocationService';
import { MarkerManager } from '../services/MarkerManager';
import { OrbitMode } from '../modes/OrbitMode';

export class CesiumVehicleGame {
  private scene: Scene;
  private gameLoop: GameLoop;
  private vehicleManager: VehicleManager;
  private cameraManager: CameraManager;
  private inputManager: InputManager;
  private objectManager: ObjectManager;
  private placementController: PlacementController;
  private touchInputManager: TouchInputManager | null = null;
  private voiceInputManager: VoiceInputManager;
  private locationService: LocationService;
  private markerManager: MarkerManager;
  private orbitMode: OrbitMode;

  constructor(containerId: string = "cesiumContainer") {
    this.scene = new Scene(containerId);
    this.gameLoop = new GameLoop(this.scene);
    this.vehicleManager = new VehicleManager(this.scene);
    this.cameraManager = new CameraManager(this.scene.camera);
    this.inputManager = new InputManager();
    this.voiceInputManager = new VoiceInputManager(this.inputManager);
    this.locationService = new LocationService();
    this.markerManager = new MarkerManager(this.scene.viewer);
    this.orbitMode = new OrbitMode();
    this.objectManager = new ObjectManager(this.scene.viewer);
    this.placementController = new PlacementController(this.scene.viewer, this.objectManager);

    this.setupSystems();
    this.setupInputHandling();
    this.setupTouchControls(containerId);
    this.setupVoiceControls();
  }

  private setupSystems(): void {
    this.gameLoop.addUpdatable(this.vehicleManager);
    this.gameLoop.addUpdatable(this.cameraManager);
    this.gameLoop.addUpdatable({
      update: (deltaTime: number) => {
        this.placementController.update(deltaTime);
        this.orbitMode.update(deltaTime);
      }
    });

    this.vehicleManager.onVehicleChange((vehicle) => {
      this.cameraManager.setTarget(vehicle);
      console.log('📷 Camera target updated to new vehicle');
    });
  }

  private setupVoiceControls(): void {
    // Register location handler for "flyga till [plats]"
    this.voiceInputManager.setLocationCallback(async (location: string) => {
      console.log(`🗺️ Voice command: Fly to ${location}`);
      console.log(`📍 Searching for location: "${location}"`);

      // Search for location
      const result = await this.locationService.searchLocation(location);

      if (!result) {
        console.error(`❌ Could not find location: ${location}`);
        console.error(`   Tried searching for: "${location}"`);
        console.error(`   Try more specific names like "Göteborg centrum" or "Stockholm"`);
        return;
      }

      console.log(`✅ Found: ${result.display_name}`);
      console.log(`   Coordinates: ${result.lat}, ${result.lon}`);

      // Create marker at the location
      const position = Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 100);

      this.markerManager.addMarker({
        position: position,
        name: result.display_name,
        radius: 800,
        height: 100,
      });

      console.log(`🎯 Marker created at ${result.display_name}`);

      // Get current aircraft
      const vehicle = this.vehicleManager.getActiveVehicle();
      if (!vehicle) {
        console.error('No active vehicle');
        return;
      }

      // Start orbiting around the location
      this.orbitMode.startOrbit(vehicle as any, {
        center: position,
        radius: 1200, // 1.2km orbit radius
        altitude: 400, // 400m altitude
        speed: 80, // 80 m/s (~180 mph)
      });

      console.log(`🔄 Orbiting around ${result.display_name}`);
      console.log(`   Orbit radius: 1200m, Altitude: 400m, Speed: 80m/s`);
    });

    // Register status callback for UI feedback
    this.voiceInputManager.setLocationStatusCallback((status, message) => {
      console.log(`📊 Location status: ${status} - ${message || ''}`);
    });
  }

  private setupInputHandling(): void {
    this.vehicleManager.setupInputHandling(this.inputManager);
    this.cameraManager.setupInputHandling(this.inputManager);
    
    // Builder placement inputs
    this.inputManager.onInput('throttle', (pressed) => this.placementController.setMoveInput({ forward: pressed }));
    this.inputManager.onInput('brake', (pressed) => this.placementController.setMoveInput({ backward: pressed }));
    this.inputManager.onInput('turnLeft', (pressed) => this.placementController.setMoveInput({ left: pressed }));
    this.inputManager.onInput('turnRight', (pressed) => this.placementController.setMoveInput({ right: pressed }));
    this.inputManager.onInput('altitudeUp', (pressed) => this.placementController.setMoveInput({ up: pressed }));
    this.inputManager.onInput('altitudeDown', (pressed) => this.placementController.setMoveInput({ down: pressed }));
    
    // Space bar to spawn object
    this.inputManager.onInput('spawnObject', (pressed) => {
      if (pressed) {
        this.placementController.placeObjectAtCursor();
      }
    });
  }

  private setupTouchControls(containerId: string): void {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    this.touchInputManager = new TouchInputManager(container);
    
    this.touchInputManager.onInput('rollLeft', (pressed) => 
      this.vehicleManager.handleInput('rollLeft', pressed)
    );
    this.touchInputManager.onInput('rollRight', (pressed) => 
      this.vehicleManager.handleInput('rollRight', pressed)
    );
    this.touchInputManager.onInput('altitudeUp', (pressed) => 
      this.vehicleManager.handleInput('altitudeUp', pressed)
    );
    this.touchInputManager.onInput('altitudeDown', (pressed) => 
      this.vehicleManager.handleInput('altitudeDown', pressed)
    );

    console.log('📱 Touch controls initialized');
  }

  public async startCinematicSequence(): Promise<void> {
    const spawnPosition = Cesium.Cartesian3.fromDegrees(11.9746, 57.7089, 150);

    console.log('🎬 Starting cinematic sequence...');

    this.scene.startEarthSpin();
    await this.delay(3000);

    this.scene.stopEarthSpin();
    await this.scene.zoomToLocation(spawnPosition, 4500);

    console.log('🚁 Spawning drone...');
    const drone = await this.vehicleManager.spawnDrone();
    this.cameraManager.setTarget(drone);
    this.start();
    
    console.log('🎮 Ready to fly!');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public start(): void {
    this.gameLoop.start();
    console.log('🚀 Cesium Vehicle Game started!');
  }

  public stop(): void {
    this.gameLoop.stop();
  }

  public getVehicleManager(): VehicleManager {
    return this.vehicleManager;
  }

  public getCameraManager(): CameraManager {
    return this.cameraManager;
  }

  public getInputManager(): InputManager {
    return this.inputManager;
  }

  public getScene(): Scene {
    return this.scene;
  }

  public getObjectManager(): ObjectManager {
    return this.objectManager;
  }

  public getPlacementController(): PlacementController {
    return this.placementController;
  }

  public getVoiceInputManager(): VoiceInputManager {
    return this.voiceInputManager;
  }

  public getLocationService(): LocationService {
    return this.locationService;
  }

  public getMarkerManager(): MarkerManager {
    return this.markerManager;
  }

  public getOrbitMode(): OrbitMode {
    return this.orbitMode;
  }

  public destroy(): void {
    this.stop();
    this.scene.stopEarthSpin();
    this.vehicleManager.destroy();
    this.cameraManager.destroy();
    this.inputManager.destroy();
    this.touchInputManager?.destroy();
    this.voiceInputManager.dispose();
    this.orbitMode.stopOrbit();
    this.markerManager.clearAllMarkers();
    this.locationService.clearCache();
  }
}

export async function startCesiumVehicleGame(): Promise<CesiumVehicleGame> {
  const game = new CesiumVehicleGame();
  await game.startCinematicSequence();
  return game;
}
