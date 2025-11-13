import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { ControlButton } from './ControlButton';
import { VEHICLE_CONTROLS, CAMERA_CONTROLS, MODE_CONTROLS, BUILDER_CONTROLS } from '../constants';
import { useGameMode } from '../../../hooks/useGameMode';
import { useGameMethod } from '../../../hooks/useGameMethod';

const swedishLandmarks: Record<string, { 
  lat: number; 
  lon: number; 
  name: string;
  type: 'building' | 'square' | 'house' | 'area';
  altitude: number;
  radius: number;
  speed: number;
}> = {
  // Byggnader
  "turning torso malmö": { 
    lat: 55.6135, lon: 12.9758, name: "Turning Torso",
    type: 'building', altitude: 100, radius: 300, speed: 6
  },
  
  // Torg
  "stortorget malmö": { 
    lat: 55.6045, lon: 12.9915, name: "Stortorget",
    type: 'square', altitude: 50, radius: 150, speed: 5
  },
  
  // Hus
  "ingefärsgatan 99": {
    lat: 57.7089, lon: 11.9746, name: "Ingefärsgatan 99", 
    type: 'house', altitude: 30, radius: 100, speed: 5
  },
  
  // Områden
  "liseberg göteborg": { 
    lat: 57.6956, lon: 11.9904, name: "Liseberg",
    type: 'area', altitude: 80, radius: 400, speed: 8
  }
};
  export function ControlsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [isAiInspectionOpen, setIsAiInspectionOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [aiInspectionQuery, setAiInspectionQuery] = useState('');
  const { mode } = useGameMode();
  const { teleportTo, startOrbitMode } = useGameMethod();
  console.log("startOrbitMode finns:", typeof startOrbitMode);
  
  
  
  // 1. KOMPLETT handleDestinationSearch funktion
const handleDestinationSearch = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!destinationQuery.trim()) return;
  
  const query = destinationQuery.toLowerCase().trim();

  // Kolla landmarks först
  if (swedishLandmarks[query]) {
    const landmark = swedishLandmarks[query];
    teleportTo(landmark.lon, landmark.lat, 1000, 0);
    setIsDestinationOpen(false);
    setDestinationQuery('');
    return;
  }

  // Annars använd geokodning
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationQuery)}&limit=1`
    );
    const data = await response.json();
    
    if (data.length > 0) {
      const { lat, lon } = data[0];
      teleportTo(parseFloat(lon), parseFloat(lat), 1000, 0);
      setIsDestinationOpen(false);
      setDestinationQuery('');
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
};

// 2. KOMPLETT handleAiInspection funktion
const handleAiInspection = async (e: React.FormEvent) => {
  e.preventDefault();
  console.log("🤖 AI-funktion startad!");
  
  if (!aiInspectionQuery.trim()) return;
  
  const query = aiInspectionQuery.toLowerCase().trim();
  
  // Först kolla lokala landmarks
  if (swedishLandmarks[query]) {
    const landmark = swedishLandmarks[query];
    console.log("✅ Hittade i lokala landmarks:", landmark);
    startOrbitMode(landmark.lon, landmark.lat, 500, 150, 0.02);
    setIsAiInspectionOpen(false);
    setAiInspectionQuery('');
    return;
  }
  
  // Sedan sök i hela Sverige automatiskt
  try {
    console.log("🔍 Söker i hela Sverige efter:", query);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=se&limit=1`
    );
    const data = await response.json();
    
    if (data.length > 0) {
  // Försök hitta mest specifik match först
  let bestMatch = data[0];
  
  for (const place of data) {
    if (place.address && place.address.house_number) {
      bestMatch = place;
      break;
    }
  }
  
  const lat = parseFloat(bestMatch.lat);
  const lon = parseFloat(bestMatch.lon);
  
  // SÄKERHETSVALIDERING:
  if (isNaN(lat) || isNaN(lon)) {
    console.log("❌ Ogiltiga koordinater");
    return;
  }
  
    console.log("✅ Hittade:", bestMatch.display_name);
    console.log("📍 Koordinater:", lat, lon);
    
        // MYCKET SÄKRARE HÖJDER - aldrig under 150m
    let altitude = Math.max(150, 100); // Minst 150m höjd
    let radius = 200;

    if (bestMatch.type === 'city' || bestMatch.type === 'town') {
      altitude = 300;  // Högt över städer
      radius = 500;
    }
    if (bestMatch.class === 'building') {
      altitude = 200;  // Säkert över byggnader  
      radius = 150;
    }
    if (bestMatch.address && bestMatch.address.house_number) {
      altitude = 250;  // Extra säker höjd för adresser
      radius = 300;
    }

    console.log("🚁 Flyger till säker höjd:", altitude, "radie:", radius);
    startOrbitMode(lon, lat, radius, altitude, 0.02);
        // ...
      }
  } catch (error) {
    console.error('Sverige-sökning fel:', error);
  }
};

// 3. useEffect
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      setIsOpen(prev => !prev);
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 left-8 z-50 w-12 h-12 flex items-center justify-center
                   glass-panel hover:bg-white/10 transition-all duration-300
                   text-white/60 hover:text-white text-lg group"
        title="Show Controls (?)"
      >
        <span className="group-hover:scale-110 transition-transform">?</span>
      </button>



      {/* Destination Button */}
      <button
        onClick={() => setIsDestinationOpen(!isDestinationOpen)}
        className="fixed bottom-8 left-24 z-50 w-12 h-12 flex items-center justify-center
                  glass-panel hover:bg-white/10 transition-all duration-300
                  text-white/60 hover:text-white text-lg group"
        title="Fly to Destination"
      >
        <span className="group-hover:scale-110 transition-transform">🎯</span>
      </button>



      {/* AI Granskning Button - FLYTTA HIT UTANFÖR PANELEN */}
      <button
        onClick={() => setIsAiInspectionOpen(!isAiInspectionOpen)}
        className="fixed bottom-8 left-40 z-50 w-12 h-12 flex items-center justify-center
                  glass-panel hover:bg-white/10 transition-all duration-300
                  text-white/60 hover:text-white text-lg group"
        title="AI Granskning"
      >
        <span className="group-hover:scale-110 transition-transform">🤖</span>
      </button>




      {/* Destination Search Panel */}
      {isDestinationOpen && (
        <div className="fixed bottom-24 left-24 z-50 animate-fade-in">
          <Panel title="Fly to Destination" className="min-w-[280px]">
            <form onSubmit={handleDestinationSearch}>
              <input
                type="text"
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                onKeyPress={(e) => e.stopPropagation()}
                placeholder="Enter city or address..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg 
                          text-white placeholder:text-white/30
                          focus:outline-none focus:border-blue-400/50"
                autoFocus
              />
              <button
                type="submit"
                className="w-full mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 
                          text-white rounded-lg transition-colors"
              >
                Fly There
              </button>
            </form>
          </Panel>
        </div>
      )}


      {/* AI Inspection Panel */}
      {isAiInspectionOpen && (
        <div className="fixed bottom-24 left-40 z-50 animate-fade-in">
          <Panel title="AI Granskning" className="min-w-[280px]">
            <form onSubmit={handleAiInspection}>  {/* DENNA RAD SKA FINNAS */}
              <input
                type="text"
                value={aiInspectionQuery}
                onChange={(e) => setAiInspectionQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                onKeyPress={(e) => e.stopPropagation()}
                placeholder="Område att granska..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg 
                          text-white placeholder:text-white/30
                          focus:outline-none focus:border-green-400/50"
                autoFocus
              />
              <button
                type="submit"
                className="w-full mt-2 px-4 py-2 bg-green-500 hover:bg-green-600 
                          text-white rounded-lg transition-colors"
              >
                Starta AI Granskning
              </button>
            </form>
          </Panel>
        </div>
      )}

      {isOpen && (
        <div className="fixed bottom-24 left-8 z-50 animate-fade-in">
          <Panel title={mode === 'builder' ? 'Builder Controls' : 'Controls'} className="min-w-[280px] max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              {mode === 'builder' ? (
                <>
                  <div className="space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Builder Camera
                    </div>
                    {BUILDER_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Modes
                    </div>
                    {MODE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Vehicle
                    </div>
                    {VEHICLE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Camera
                    </div>
                    {CAMERA_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2.5">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
                      Modes
                    </div>
                    {MODE_CONTROLS.map((control, idx) => (
                      <ControlButton key={idx} keys={control.keys} description={control.description} />
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-white/5 pt-3">
                <div className="text-[10px] text-white/30">
                  Press <kbd className="px-1 py-0.5 bg-white/5 rounded text-white/50">?</kbd> to close
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}


