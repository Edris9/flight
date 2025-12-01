import { useGameBridge } from './useGameBridge';
import type { CameraType } from '../../cesium/managers/CameraManager';
import type { VehicleStateData } from '../../cesium/bridge/types';
import type { QualityConfig } from '../../cesium/core/Scene';
import type { MissionAction } from '../../cesium/bridge/GameBridge'; // Importera typen

export function useGameMethod() {
  const bridge = useGameBridge();

  return {
    switchCamera: () => bridge.switchCamera(),
    getCameraType: (): CameraType => bridge.getCameraType(),
    teleportTo: (longitude: number, latitude: number, altitude: number, heading?: number, fly?: boolean, shouldOrbit?: boolean) => 
      bridge.teleportTo(longitude, latitude, altitude, heading, fly, shouldOrbit),
    startOrbitMode: (centerLon: number, centerLat: number, radius: number = 300, altitude: number = 150, speed: number = 0.02) => 
      bridge.startOrbitMode(centerLon, centerLat, radius, altitude, speed),
    
    // NY FUNKTION
    executeMission: (actions: MissionAction[]) => bridge.executeMission(actions),

    restart: () => bridge.restart(),
    toggleRoverMode: () => bridge.toggleRoverMode(),
    toggleVehicleType: () => bridge.toggleVehicleType(),
    getRoverMode: (): boolean => bridge.getRoverMode(),
    toggleCollisionDetection: () => bridge.toggleCollisionDetection(),
    getCollisionDetection: (): boolean => bridge.getCollisionDetection(),
    getVehicleState: (): VehicleStateData | null => bridge.getVehicleState(),
    getQualitySettings: (): QualityConfig => bridge.getQualitySettings(),
    updateQualitySettings: (config: Partial<QualityConfig>) => bridge.updateQualitySettings(config),
    applyQualityPreset: (preset: 'performance' | 'balanced' | 'quality' | 'ultra') => bridge.applyQualityPreset(preset),
    toggleBuilderMode: () => bridge.toggleBuilderMode(),
    setMode: (mode: 'play' | 'builder') => bridge.setMode(mode),
    getMode: () => bridge.getMode(),
    setThrottle: (percent: number) => bridge.setThrottle(percent),
  };
}