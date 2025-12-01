import * as Cesium from 'cesium';
import { TypedEventEmitter } from './TypedEventEmitter';
import type { GameEvents, VehicleStateData, GameMode } from './types';
import type { CesiumVehicleGame } from '../bootstrap/main';
import type { CameraType } from '../managers/CameraManager';
import type { QualityConfig } from '../core/Scene';
import { Car } from '../vehicles/car/Car';
import { Aircraft } from '../vehicles/aircraft/Aircraft';
import type { Vehicle } from '../vehicles/Vehicle';
import { ModeManager } from '../modes/ModeManager';

export interface MissionAction {
  type: 'fly' | 'orbit' | 'wait';
  lon?: number;
  lat?: number;
  alt?: number;
  speed?: number;    // km/h (Display speed)
  duration?: number; // seconds
  radius?: number;   // meters
}

export class GameBridge extends TypedEventEmitter<GameEvents> {
  private game: CesiumVehicleGame;
  private updateInterval: number | null = null;
  private activeMoveInterval: any = null;
  private activeMoveResolve: (() => void) | null = null;
  private currentMode: GameMode = 'play';
  private modeManager: ModeManager;

  constructor(game: CesiumVehicleGame) {
    super();
    this.game = game;
    this.modeManager = new ModeManager(game);
    this.startUpdates();
    this.setupVehicleChangeListener();
    this.setupBuilderModeListener();
    this.applyQualityPreset('performance');
  }

  // --- SETUP ---
  private setupBuilderModeListener(): void { this.game.getInputManager().onInput('toggleBuilder', (p) => p && this.toggleBuilderMode()); }
  private setupVehicleChangeListener(): void { this.game.getVehicleManager().addVehicleChangeListener((v) => this.emitVehicleChangeEvents(v)); }
  private startUpdates(): void { this.updateInterval = window.setInterval(() => this.emitVehicleState(), 16); }
  
  private emitVehicleState(): void {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    if (vehicle && vehicle.isModelReady()) {
      const state = vehicle.getState();
      this.emit('vehicleStateChanged', { speed: state.speed, velocity: state.velocity, position: state.position, heading: state.heading, pitch: state.pitch, roll: state.roll });
      if (vehicle instanceof Aircraft && vehicle.isCrashed()) this.emit('crashed', { crashed: true });
    }
  }

  public emitVehicleChangeEvents(vehicle: Vehicle): void {
    if (vehicle instanceof Car) {
      this.emit('collisionDetectionChanged', { enabled: vehicle.getCollisionDetection() });
      this.emit('roverModeChanged', { enabled: vehicle.getRoverMode() });
    } else if (vehicle instanceof Aircraft) {
      this.emit('collisionDetectionChanged', { enabled: false });
      this.emit('roverModeChanged', { enabled: false });
    }
  }

  private setPhysics(enabled: boolean) {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    if (vehicle) {
      (vehicle as any).physicsEnabled = enabled;
      if (!enabled) vehicle.setInput({ throttle: false, brake: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false });
    }
  }

  // --- MISSION EXECUTOR (Fixar Hopp-buggen) ---
  public async executeMission(actions: MissionAction[]): Promise<void> {
    console.log("📜 Mission Started with steps:", actions.length);
    this.stopActiveMovement();
    
    // VIKTIGT: Vänta en mikrosekund så att activeMoveInterval hinner rensas helt
    // Detta förhindrar att startpositionen för nästa steg blir fel ("hoppar").
    await new Promise(r => setTimeout(r, 50));

    for (const action of actions) {
      console.log(`➡️ Step: ${action.type}`, action);
      try {
        if (action.type === 'fly' && action.lon && action.lat) {
          await this.flyToLocationPromise(action.lon, action.lat, action.alt || 200, 0, action.speed);
        } 
        else if (action.type === 'orbit' && action.lon && action.lat) {
          await this.startOrbitPromise(action.lon, action.lat, action.radius || 300, action.alt || 150, 0.05, action.duration);
        } 
        else if (action.type === 'wait' && action.duration) {
          await new Promise<void>(resolve => {
            console.log(`⏳ Waiting ${action.duration}s...`);
            setTimeout(resolve, action.duration! * 1000);
          });
        }
      } catch (e) {
        console.error("Mission step interrupted", e);
        break; 
      }
    }
    console.log("✅ Mission Complete");
    this.setPhysics(true);
  }

  public teleportTo(longitude: number, latitude: number, altitude: number, heading: number = 0, fly: boolean = false, shouldOrbit: boolean = false): void {
    this.stopActiveMovement();
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    if (!vehicle) return;

    if (fly) {
      this.flyToLocationPromise(longitude, latitude, altitude, heading, undefined).then(() => {
        if (shouldOrbit) this.startOrbitPromise(longitude, latitude, 400, altitude, 0.05);
        else this.setPhysics(true);
      });
    } else {
      const pos = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
      const state = vehicle.getState();
      vehicle.setState({ ...state, position: pos, heading: Cesium.Math.toRadians(heading), velocity: 0, speed: 0 });
      this.emit('locationChanged', { longitude, latitude, altitude });
      if (shouldOrbit) this.startOrbitPromise(longitude, latitude, 300, altitude, 0.05);
    }
  }

  // --- SMART FLYGNING (Fixar Fart-buggen) ---
  private flyToLocationPromise(targetLon: number, targetLat: number, targetAlt: number, targetHeading: number, requestSpeedKmH?: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopActiveMovement();
      this.activeMoveResolve = resolve;
      this.setPhysics(false);

      const vehicle = this.game.getVehicleManager().getActiveVehicle();
      if (!vehicle) { resolve(); return; }

      // 1. Hämta exakt nuvarande position (för att undvika hopp)
      const startState = vehicle.getState();
      const startPos = Cesium.Cartographic.fromCartesian(startState.position);
      const endPos = Cesium.Cartographic.fromDegrees(targetLon, targetLat, targetAlt);
      
      const startCart = startState.position;
      const endCart = Cesium.Cartesian3.fromDegrees(targetLon, targetLat, targetAlt);
      const distance = Cesium.Cartesian3.distance(startCart, endCart); // Meter

      // 2. LOGIK FÖR SIMULERAD HASTIGHET
      // Vi vill att resan ska ta lagom tid (Game feel), oavsett vad mätaren visar.
      const MAX_FLIGHT_TIME = 8.0; // Max 8 sekunder för långa resor
      const MIN_FLIGHT_TIME = 2.0; // Minst 2 sekunder för korta hopp

      // Vad användaren bad om (Display Speed)
      let displaySpeedKmH = requestSpeedKmH || 300; 
      
      // Beräkna "Fysik-hastighet" (Hur fort vi faktiskt flyttar modellen)
      let physicsSpeedMs = 0;

      // Om användaren bad om en specifik hastighet, kolla om den är "för långsam" för avståndet
      const realTimeNeeded = distance / (displaySpeedKmH / 3.6);
      
      if (realTimeNeeded > MAX_FLIGHT_TIME) {
        // Om det skulle ta mer än 8 sekunder -> Fuska!
        // Sätt fysik-hastigheten så att det tar exakt 8 sekunder
        physicsSpeedMs = distance / MAX_FLIGHT_TIME;
        console.log(`🚀 Boost active: Display=${displaySpeedKmH}km/h, Real=${Math.round(physicsSpeedMs*3.6)}km/h`);
      } else {
        // Om det går fort nog (eller kort avstånd), kör äkta hastighet
        physicsSpeedMs = displaySpeedKmH / 3.6;
      }
      
      // Säkerställ att vi inte flyger snabbare än ljuset (teleport) vid korta avstånd
      const duration = Math.max(distance / physicsSpeedMs, MIN_FLIGHT_TIME);

      let elapsed = 0;
      const updateRate = 0.016;

      console.log(`✈️ Path: ${Math.round(distance/1000)}km. Time: ${duration.toFixed(1)}s. HUD: ${displaySpeedKmH} km/h`);

      this.activeMoveInterval = setInterval(() => {
        elapsed += updateRate;
        const t = Math.min(elapsed / duration, 1.0);
        const smoothT = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        const curLon = Cesium.Math.lerp(startPos.longitude, endPos.longitude, smoothT);
        const curLat = Cesium.Math.lerp(startPos.latitude, endPos.latitude, smoothT);
        const curAlt = Cesium.Math.lerp(startPos.height, endPos.height, smoothT);
        
        const newPosition = Cesium.Cartesian3.fromRadians(curLon, curLat, curAlt);
        
        vehicle.setState({
          ...vehicle.getState(),
          position: newPosition,
          velocity: physicsSpeedMs,    // Fysiken använder den "snabba" farten
          speed: displaySpeedKmH,      // HUD visar vad användaren bad om (200)
          pitch: 0, 
          roll: 0
        });

        if (t >= 1.0) {
          this.stopActiveMovement();
          vehicle.setState({
            ...vehicle.getState(),
            position: Cesium.Cartesian3.fromDegrees(targetLon, targetLat, targetAlt),
            velocity: 0,
            speed: 0,
            heading: Cesium.Math.toRadians(targetHeading)
          });
          this.emit('locationChanged', { longitude: targetLon, latitude: targetLat, altitude: targetAlt });
          console.log("📍 Arrived.");
        }
      }, 16);
    });
  }

  // --- ORBIT ---
  public startOrbitPromise(centerLon: number, centerLat: number, radius: number, altitude: number, speed: number, duration?: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopActiveMovement();
      this.activeMoveResolve = resolve;
      this.setPhysics(false);

      const vehicle = this.game.getVehicleManager().getActiveVehicle();
      if (!vehicle) { resolve(); return; }

      let angle = 0; 
      const radiusInDegrees = radius / 111000; 
      let elapsed = 0;
      
      console.log(`🔄 Orbiting...`);

      this.activeMoveInterval = setInterval(() => {
        const offsetLon = Math.cos(angle) * radiusInDegrees;
        const offsetLat = Math.sin(angle) * radiusInDegrees;
        const orbitPosition = Cesium.Cartesian3.fromDegrees(centerLon + offsetLon, centerLat + offsetLat, altitude);
        
        vehicle.setState({
          ...vehicle.getState(),
          position: orbitPosition,
          velocity: 100, 
          speed: 250, // Orbit hastighet på display
          heading: angle + Math.PI/2,
          pitch: 0,
          roll: Cesium.Math.toRadians(20)
        });
        
        angle += speed;
        elapsed += 0.05;

        if (duration && elapsed >= duration) {
          this.stopActiveMovement(); 
        }
      }, 50);
    });
  }

  // ... (Resten är oförändrad) ...
  private stopActiveMovement(): void {
    if (this.activeMoveInterval) { clearInterval(this.activeMoveInterval); this.activeMoveInterval = null; }
    if (this.activeMoveResolve) { this.activeMoveResolve(); this.activeMoveResolve = null; }
  }
  public startOrbitMode(centerLon: number, centerLat: number, r: number=300, a: number=150, s: number=0.02) { this.startOrbitPromise(centerLon, centerLat, r, a, s); }
  public restart() { this.stopActiveMovement(); this.setPhysics(true); const v = this.game.getVehicleManager().getActiveVehicle(); if(v && v instanceof Aircraft && v.isCrashed()){ v.resetCrash(); v.setState({...v.getState(), position: Cesium.Cartesian3.fromDegrees(11.9746, 57.7089, 200), velocity:0, speed:0}); this.emit('crashed', {crashed:false}); }}
  public destroy() { this.stopActiveMovement(); if(this.updateInterval) clearInterval(this.updateInterval); this.removeAllListeners(); }
  public getQualitySettings() { return this.game.getScene().getQualityConfig(); }
  public updateQualitySettings(c: Partial<QualityConfig>) { this.game.getScene().updateQualityConfig(c); }
  public toggleBuilderMode() { this.setMode(this.currentMode==='play'?'builder':'play'); }
  public setMode(m: GameMode) { if(this.currentMode!==m){ const p=this.currentMode; this.currentMode=m; this.modeManager.onModeChanged(p, m); this.emit('modeChanged', {mode:m, previousMode:p}); } }
  public getMode() { return this.currentMode; }
  public applyQualityPreset(p: string) {}
  public switchCamera() { const cm=this.game.getCameraManager(); cm.switchCamera(); this.emit('cameraChanged', {type:cm.getActiveCameraType()}); }
  public getCameraType() { return this.game.getCameraManager().getActiveCameraType(); }
  public toggleRoverMode() { const v=this.game.getVehicleManager().getActiveVehicle(); if(v instanceof Car){ const n=!v.getRoverMode(); v.setRoverMode(n); this.emit('roverModeChanged', {enabled:n}); } }
  public toggleVehicleType() { this.game.getVehicleManager().toggleVehicleType(); }
  public getRoverMode() { const v=this.game.getVehicleManager().getActiveVehicle(); return v instanceof Car?v.getRoverMode():true; }
  public toggleCollisionDetection() { const v=this.game.getVehicleManager().getActiveVehicle(); if(v instanceof Car){ v.toggleCollisionDetection(); this.emit('collisionDetectionChanged', {enabled:v.getCollisionDetection()}); } else this.emit('collisionDetectionChanged', {enabled:false}); }
  public getCollisionDetection() { const v=this.game.getVehicleManager().getActiveVehicle(); return v instanceof Car?v.getCollisionDetection():false; }
  public getVehicleState() { const v=this.game.getVehicleManager().getActiveVehicle(); if(v && v.isModelReady()){ const s=v.getState(); return {speed:s.speed, velocity:s.velocity, position:s.position, heading:s.heading, pitch:s.pitch, roll:s.roll}; } return null; }
  public setThrottle(p: number) { this.game.getInputManager().setThrottlePercent(p*100); }
}