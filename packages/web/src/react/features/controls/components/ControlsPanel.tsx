import { useState, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { ControlButton } from './ControlButton';
import { VEHICLE_CONTROLS, CAMERA_CONTROLS, MODE_CONTROLS, BUILDER_CONTROLS } from '../constants';
import { useGameMode } from '../../../hooks/useGameMode';
import { useGameMethod } from '../../../hooks/useGameMethod';

  export function ControlsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const { mode } = useGameMode();
  const { teleportTo } = useGameMethod(); // Lägg till denna
  const handleDestinationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationQuery.trim()) return;

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

      {/* Destination Search Panel */}
      {isDestinationOpen && (
        <div className="fixed bottom-24 left-24 z-50 animate-fade-in">
          <Panel title="Fly to Destination" className="min-w-[280px]">
            <form onSubmit={handleDestinationSearch}>
              <input
                type="text"
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
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


