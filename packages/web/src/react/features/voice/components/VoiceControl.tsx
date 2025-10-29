import { useState, useEffect } from 'react';
import { useGameMethod } from '../../../hooks/useGameMethod';

export function VoiceControl() {
  const { toggleVoiceControl, isVoiceControlActive, setVoiceStatusCallback } = useGameMethod();
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    // Set up callback to receive voice status updates
    setVoiceStatusCallback((listening: boolean, transcript?: string) => {
      setIsListening(listening);
      if (transcript) {
        setLastTranscript(transcript);
        setShowTranscript(true);
        // Hide transcript after 3 seconds
        setTimeout(() => setShowTranscript(false), 3000);
      }
    });

    // Check initial state
    const initialState = isVoiceControlActive();
    setIsListening(initialState);
  }, [setVoiceStatusCallback, isVoiceControlActive]);

  const handleToggle = () => {
    toggleVoiceControl();
    const newState = isVoiceControlActive();
    setIsListening(newState);
    if (!newState) {
      setShowTranscript(false);
    }
  };

  return (
    <div className="fixed bottom-8 left-8 z-50 flex flex-col gap-2 pointer-events-auto">
      {/* Voice Control Button */}
      <button
        onClick={handleToggle}
        className={`glass-panel px-4 py-2.5 transition-all duration-300 group ${
          isListening ? 'bg-red-500/20 hover:bg-red-500/30' : 'hover:bg-white/10'
        }`}
        title={isListening ? 'Stoppa r\u00f6ststyrning (klicka)' : 'Starta r\u00f6ststyrning (klicka)'}
      >
        <div className="flex items-center gap-2">
          {/* Microphone Icon */}
          <svg
            className={`w-4 h-4 transition-colors ${
              isListening ? 'text-red-400 animate-pulse' : 'text-white/60 group-hover:text-white/90'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {isListening ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            )}
          </svg>
          <span
            className={`text-xs font-medium transition-colors ${
              isListening ? 'text-red-300' : 'text-white/80 group-hover:text-white'
            }`}
          >
            {isListening ? 'Lyssnar...' : 'R\u00f6ststyrning'}
          </span>
        </div>
      </button>

      {/* Last Command Display */}
      {showTranscript && lastTranscript && (
        <div className="glass-panel px-4 py-2 animate-fade-in">
          <p className="text-xs text-white/70">Kommando:</p>
          <p className="text-sm text-white font-medium">{lastTranscript}</p>
        </div>
      )}

      {/* Help Text (only shown when active) */}
      {isListening && (
        <div className="glass-panel px-4 py-2 max-w-xs">
          <p className="text-xs text-white/70 mb-2 font-semibold">📍 Platser:</p>
          <div className="text-xs text-white/60 space-y-1 mb-3">
            <p><span className="text-yellow-400">"Flyga till Göteborg"</span></p>
            <p><span className="text-yellow-400">"Flyga till Stockholm centrum"</span></p>
            <p className="text-white/50 text-[10px] italic">Cirklar runt platsen med visuell markering</p>
          </div>

          <p className="text-xs text-white/70 mb-1 font-semibold">✈️ Flyg:</p>
          <div className="text-xs text-white/60 space-y-0.5">
            <p><span className="text-white/80">Gas, Bromsa</span> - Hastighet</p>
            <p><span className="text-white/80">Upp, Ner</span> - Höjd</p>
            <p><span className="text-white/80">Vänster, Höger</span> - Sväng</p>
            <p><span className="text-white/80">Stopp</span> - Sluta alla kommandon</p>
          </div>
        </div>
      )}
    </div>
  );
}
