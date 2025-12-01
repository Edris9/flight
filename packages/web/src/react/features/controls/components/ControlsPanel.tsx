import { useState, useEffect, useRef } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { ControlButton } from './ControlButton';
import { VEHICLE_CONTROLS, CAMERA_CONTROLS, MODE_CONTROLS, BUILDER_CONTROLS } from '../constants';
import { useGameMode } from '../../../hooks/useGameMode';
import { useGameMethod } from '../../../hooks/useGameMethod';
import type { MissionAction } from '../../../../cesium/bridge/GameBridge';

// 👇 DIN NYCKEL
const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const swedishLandmarks: Record<string, { lat: number; lon: number; name: string; type: 'building' | 'square' | 'house' | 'area'; altitude: number; radius: number; speed: number; }> = {
  "turning torso malmö": { lat: 55.6135, lon: 12.9758, name: "Turning Torso", type: 'building', altitude: 100, radius: 300, speed: 6 },
  "stortorget malmö": { lat: 55.6045, lon: 12.9915, name: "Stortorget", type: 'square', altitude: 50, radius: 150, speed: 5 },
  "liseberg göteborg": { lat: 57.6956, lon: 11.9904, name: "Liseberg", type: 'area', altitude: 80, radius: 400, speed: 8 },
  "kungälv": { lat: 57.8739, lon: 11.9722, name: "Kungälv", type: 'area', altitude: 150, radius: 400, speed: 8 },
};

async function geocodeLocation(locationName: string | undefined) {
  if (!locationName || typeof locationName !== 'string') return null;
  const query = locationName.toLowerCase().trim();
  if (swedishLandmarks[query]) return swedishLandmarks[query];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const coords = data.features[0].geometry.coordinates;
      return { lon: coords[0], lat: coords[1], name: data.features[0].properties.name };
    }
  } catch (e) { console.error("Geocode failed", e); }
  return null;
}

export function ControlsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [isAiInspectionOpen, setIsAiInspectionOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState(''); 
  const recognitionRef = useRef<any>(null); 
  const [destinationQuery, setDestinationQuery] = useState('');
  const [aiInspectionQuery, setAiInspectionQuery] = useState('');
  const { mode } = useGameMode();
  const { teleportTo, startOrbitMode, executeMission } = useGameMethod();

  const toggleVoiceRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      setIsRecording(false);
      if (voiceText.trim().length > 0) processVoiceText(voiceText);
      setVoiceText(''); 
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) { alert("Ingen mikrofonstöd."); return; }
      const recognition = new SpeechRecognition();
      recognition.lang = 'sv-SE'; recognition.continuous = true; recognition.interimResults = true; 
      recognition.onresult = (event: any) => {
        let finalScript = '';
        for (let i = 0; i < event.results.length; i++) finalScript += event.results[i][0].transcript;
        setVoiceText(finalScript);
      };
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      setVoiceText(''); 
    }
  };

  // --- NY RENSA-FUNKTION ---
  const clearVoice = () => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }
    setIsRecording(false);
    setVoiceText(''); // Töm texten
  };

  const processVoiceText = async (text: string) => {
    console.log("🧠 AI Processing:", text);
    if (!OPENAI_KEY || OPENAI_KEY.includes("YOUR_OPENAI_KEY")) { alert("Ingen API-nyckel!"); return; }

    const tools = [{ type: "function", function: { name: "plan_mission", description: "Planera flygning.", parameters: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { action: { type: "string", enum: ["fly", "inspect", "wait"] }, location: { type: "string" }, speed: { type: "number" }, duration: { type: "number" } } } } }, required: ["steps"] } } }];

    const systemPrompt = `
      You are a smart drone controller. 
      RULES:
      1. Correct Swedish place names (e.g. "Riktig kongress" -> "Kungälv").
      2. SPEED: If user says a number (e.g. 200), use it. If not, leave undefined.
      3. ACTIONS: "Granska/Inspektera" -> action: "inspect".
    `;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }], tools, tool_choice: { type: "function", function: { name: "plan_mission" } } })
      });

      const data = await response.json();
      const toolCall = data.choices[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log("📋 Plan received:", args.steps);
        await buildAndExecuteMission(args.steps);
      }
    } catch (e) { console.error("OpenAI Error:", e); }
  };

  const buildAndExecuteMission = async (steps: any[]) => {
    const mission: MissionAction[] = [];
    for (const step of steps) {
      if (step.action === 'fly' || step.action === 'inspect') {
        const coords = await geocodeLocation(step.location);
        if (coords) {
          const radiusMeters = 300; 
          if (step.action === 'fly') {
            mission.push({ type: 'fly', lon: coords.lon, lat: coords.lat, alt: 200, speed: step.speed });
          } else if (step.action === 'inspect') {
            const oneDegreeLatInMeters = 111000;
            const radiusDeg = radiusMeters / oneDegreeLatInMeters;
            const latRad = coords.lat * (Math.PI / 180);
            const radiusDegLon = radiusDeg / Math.cos(latRad);
            mission.push({ type: 'fly', lon: coords.lon + radiusDegLon, lat: coords.lat, alt: 150, speed: step.speed });
            mission.push({ type: 'orbit', lon: coords.lon, lat: coords.lat, alt: 150, radius: radiusMeters, duration: step.duration || 20 });
          }
        }
      } else if (step.action === 'wait') mission.push({ type: 'wait', duration: step.duration || 5 });
    }
    if (mission.length > 0) executeMission(mission);
  };

  // --- UI ---
  const handleDestinationSearch = async (e: React.FormEvent) => { e.preventDefault(); if (!destinationQuery.trim()) return; const coords = await geocodeLocation(destinationQuery); if (coords) { teleportTo(coords.lon, coords.lat, 1000, 0, true, true); setIsDestinationOpen(false); setDestinationQuery(''); } };
  const handleAiInspection = async (e: React.FormEvent) => { e.preventDefault(); if (!aiInspectionQuery.trim()) return; const coords = await geocodeLocation(aiInspectionQuery); if (coords) { startOrbitMode(coords.lon, coords.lat, 300, 200, 0.05); setIsAiInspectionOpen(false); setAiInspectionQuery(''); } };
  useEffect(() => { const handleKeyPress = (e: KeyboardEvent) => { if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setIsOpen(p => !p); } }; window.addEventListener('keydown', handleKeyPress); return () => window.removeEventListener('keydown', handleKeyPress); }, []);

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="fixed bottom-8 left-8 z-50 w-12 h-12 flex items-center justify-center glass-panel hover:bg-white/10 transition-all text-white/60 hover:text-white text-lg group">?</button>
      <button onClick={() => setIsDestinationOpen(!isDestinationOpen)} className="fixed bottom-8 left-24 z-50 w-12 h-12 flex items-center justify-center glass-panel hover:bg-white/10 transition-all text-white/60 hover:text-white text-lg group">🎯</button>
      <button onClick={() => setIsAiInspectionOpen(!isAiInspectionOpen)} className="fixed bottom-8 left-40 z-50 w-12 h-12 flex items-center justify-center glass-panel hover:bg-white/10 transition-all text-white/60 hover:text-white text-lg group">🤖</button>
      
      {/* VOICE BUTTONS */}
      <div className="fixed bottom-8 left-56 z-50 flex items-center gap-2">
        <button onClick={toggleVoiceRecording} className={`w-12 h-12 flex items-center justify-center glass-panel transition-all text-lg group ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'hover:bg-white/10 text-white/60 hover:text-white'}`} title={isRecording ? "Stop & Send" : "Start Recording"}><span>{isRecording ? "📤" : "🎙️"}</span></button>
        
        {/* RENSA KNAPP */}
        {isRecording && (
            <button onClick={clearVoice} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-red-500/50 rounded-full text-white/70 hover:text-white transition-colors" title="Avbryt / Rensa">
                ✕
            </button>
        )}

        {isRecording && (<div className="bg-black/80 backdrop-blur px-4 py-2 rounded-lg text-white text-sm max-w-[300px] animate-fade-in border border-white/10">{voiceText || "Lyssnar..."}</div>)}
      </div>

      {isDestinationOpen && (<div className="fixed bottom-24 left-24 z-50 animate-fade-in"><Panel title="Destination"><form onSubmit={handleDestinationSearch}><input autoFocus type="text" value={destinationQuery} onChange={e=>setDestinationQuery(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" placeholder="City..."/><button type="submit" className="w-full mt-2 px-4 py-2 bg-blue-500 rounded-lg text-white">Fly</button></form></Panel></div>)}
      {isAiInspectionOpen && (<div className="fixed bottom-24 left-40 z-50 animate-fade-in"><Panel title="Inspection"><form onSubmit={handleAiInspection}><input autoFocus type="text" value={aiInspectionQuery} onChange={e=>setAiInspectionQuery(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" placeholder="Area..."/><button type="submit" className="w-full mt-2 px-4 py-2 bg-green-500 rounded-lg text-white">Inspect</button></form></Panel></div>)}
      {isOpen && (<div className="fixed bottom-24 left-8 z-50 animate-fade-in"><Panel title={mode==='builder'?'Builder':'Controls'} className="min-w-[280px] max-h-[70vh] overflow-y-auto"><div className="space-y-4">{mode==='builder'?(<>{BUILDER_CONTROLS.map((c,i)=><ControlButton key={i}{...c}/>)}</>):(<><div className="space-y-2.5"><div className="text-xs text-white/40 mb-2">VEHICLE</div>{VEHICLE_CONTROLS.map((c,i)=><ControlButton key={i}{...c}/>)}</div><div className="border-t border-white/5 pt-4 space-y-2.5"><div className="text-xs text-white/40 mb-2">CAMERA</div>{CAMERA_CONTROLS.map((c,i)=><ControlButton key={i}{...c}/>)}</div></>)}</div></Panel></div>)}
    </>
  );
}