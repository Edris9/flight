import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { ControlButton } from './ControlButton';
import { VEHICLE_CONTROLS, CAMERA_CONTROLS, MODE_CONTROLS, BUILDER_CONTROLS } from '../constants';
import { useGameMode } from '../../../hooks/useGameMode';
import { useGameMethod } from '../../../hooks/useGameMethod';

// Göteborg landmarks - drönaren känner till alla platser i Göteborg
const swedishLandmarks: Record<string, {
  lat: number;
  lon: number;
  name: string;
  type: 'building' | 'square' | 'house' | 'area' | 'street';
  altitude: number;
  radius: number;
  speed: number;
}> = {
  // Byggnader i Göteborg
  "götaplatsen": {
    lat: 57.6969, lon: 11.9865, name: "Götaplatsen",
    type: 'square', altitude: 50, radius: 150, speed: 5
  },
  "liseberg": {
    lat: 57.6956, lon: 11.9904, name: "Liseberg",
    type: 'area', altitude: 80, radius: 400, speed: 8
  },
  "ullevi": {
    lat: 57.7069, lon: 11.9877, name: "Ullevi",
    type: 'building', altitude: 60, radius: 200, speed: 6
  },
  "scandinavium": {
    lat: 57.7008, lon: 11.9909, name: "Scandinavium",
    type: 'building', altitude: 50, radius: 150, speed: 5
  },
  "avenyn": {
    lat: 57.6996, lon: 11.9864, name: "Avenyn (Kungsportsavenyn)",
    type: 'street', altitude: 40, radius: 200, speed: 5
  },
  "haga": {
    lat: 57.6988, lon: 11.9536, name: "Haga",
    type: 'area', altitude: 50, radius: 250, speed: 6
  },
  "nordstan": {
    lat: 57.7084, lon: 11.9686, name: "Nordstan",
    type: 'building', altitude: 50, radius: 150, speed: 5
  },
  "ingefärsgatan 99": {
    lat: 57.7089, lon: 11.9746, name: "Ingefärsgatan 99",
    type: 'house', altitude: 30, radius: 100, speed: 5
  },
  "centralstationen": {
    lat: 57.7089, lon: 11.9726, name: "Göteborg Centralstation",
    type: 'building', altitude: 50, radius: 150, speed: 5
  },
  "slottsskogen": {
    lat: 57.6848, lon: 11.9398, name: "Slottsskogen",
    type: 'area', altitude: 60, radius: 300, speed: 7
  }
};
  export function ControlsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [isAiInspectionOpen, setIsAiInspectionOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [aiInspectionQuery, setAiInspectionQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const { mode } = useGameMode();
  const { teleportTo, startOrbitMode, navigateToAddress, toggleVoiceControl, isVoiceControlActive, setVoiceStatusCallback } = useGameMethod();
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
  
  // Sedan sök endast i Göteborg
  try {
    console.log("🔍 Söker i Göteborg efter:", query);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Göteborg, Sweden')}&limit=1`
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

// 3. Voice command handler
const handleVoiceCommand = async (address: string) => {
  const query = address.toLowerCase().trim();

  // Sök i Göteborg landmarks
  if (swedishLandmarks[query]) {
    const landmark = swedishLandmarks[query];
    console.log(`🚁 Navigerar till ${landmark.name} med WASD`);
    navigateToAddress(landmark.lon, landmark.lat, landmark.altitude, landmark.name, 'medium');
    setVoiceTranscript(`Flyger till ${landmark.name}`);
    return;
  }

  // Annars sök med OpenStreetMap (begränsat till Göteborg)
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Göteborg, Sweden')}&limit=1`
    );
    const data = await response.json();

    if (data.length > 0) {
      const { lat, lon, display_name } = data[0];
      console.log(`🚁 Navigerar till ${display_name} med WASD`);
      navigateToAddress(parseFloat(lon), parseFloat(lat), 100, display_name, 'medium');
      setVoiceTranscript(`Flyger till ${display_name}`);
    } else {
      setVoiceTranscript(`Kunde inte hitta: ${address}`);
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    setVoiceTranscript('Ett fel uppstod vid sökning');
  }
};

// 4. useEffect - Voice status callback
useEffect(() => {
  setVoiceStatusCallback((listening: boolean, transcript?: string) => {
    setIsListening(listening);
    if (transcript) {
      setVoiceTranscript(transcript);
      // Parse transcript för adress
      const addressMatch = transcript.match(/(?:flyga?|navigera?|åk) (?:till|mot) (.+)/i);
      if (addressMatch) {
        handleVoiceCommand(addressMatch[1]);
      }
    }
  });
}, [setVoiceStatusCallback]);

// 5. useEffect - Keyboard shortcuts
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

      {/* Voice Command Button - Call 211 */}
      <button
        onClick={() => setIsVoiceOpen(!isVoiceOpen)}
        className="fixed bottom-8 left-56 z-50 w-12 h-12 flex items-center justify-center
                  glass-panel hover:bg-white/10 transition-all duration-300
                  text-white/60 hover:text-white text-lg group"
        title="Call 211 - Voice Command"
      >
        <span className="group-hover:scale-110 transition-transform">🎙️</span>
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

      {/* Voice Command Panel */}
      {isVoiceOpen && (
        <div className="fixed bottom-24 left-56 z-50 animate-fade-in">
          <Panel title="Call 211 - Voice Command" className="min-w-[300px]">
            <div className="space-y-4">
              <div className="text-sm text-white/70">
                "Vilken adress vill du att operatör flyga till?"
              </div>

              <button
                onClick={() => {
                  toggleVoiceControl();
                  setIsListening(isVoiceControlActive());
                }}
                className={`w-full px-4 py-3 rounded-lg transition-colors ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isListening ? '🎤 Lyssnar...' : '🎙️ Tryck för att prata'}
              </button>

              {voiceTranscript && (
                <div className="p-3 bg-white/10 rounded-lg text-sm text-white">
                  "{voiceTranscript}"
                </div>
              )}
            </div>
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


