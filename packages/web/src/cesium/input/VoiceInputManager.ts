import type { InputManager, InputAction } from './InputManager';

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export interface VoiceCommand {
  keywords: string[];
  action: (transcript?: string) => void;
  continuous?: boolean;
}

export type LocationCallback = (location: string) => Promise<void>;

export class VoiceInputManager {
  private recognition: SpeechRecognition | null = null;
  private isListening = false;
  private inputManager: InputManager;
  private commands: VoiceCommand[] = [];
  private activeActions = new Set<string>();
  private onStatusChange?: (listening: boolean, transcript?: string) => void;
  private onLocationRequest?: LocationCallback;
  private lastTranscript = '';
  private restartTimeout: number | null = null;

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager;
    this.initializeRecognition();
    this.setupCommands();
  }

  private initializeRecognition(): void {
    // @ts-ignore - SpeechRecognition might not be in all browsers
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'sv-SE'; // Swedish
    this.recognition.continuous = true;
    this.recognition.interimResults = true; // Enable interim results for better responsiveness
    this.recognition.maxAlternatives = 3; // Get multiple alternatives

    this.recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const result = event.results[last];

      // Only process final results to avoid duplicates
      if (!result.isFinal) {
        return;
      }

      const transcript = result[0].transcript.toLowerCase().trim();

      // Avoid processing duplicate transcripts
      if (transcript === this.lastTranscript) {
        return;
      }

      this.lastTranscript = transcript;

      if (this.onStatusChange) {
        this.onStatusChange(true, transcript);
      }

      this.processCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);

      // Don't stop on these non-critical errors
      if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'aborted') {
        this.scheduleRestart();
        return;
      }

      // Stop on critical errors
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        console.error('Microphone access denied');
        this.stop();
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this.isListening) {
        this.scheduleRestart();
      }
    };
  }

  private scheduleRestart(): void {
    // Clear existing restart timeout
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    // Schedule restart after a short delay
    this.restartTimeout = window.setTimeout(() => {
      if (this.isListening && this.recognition) {
        try {
          this.recognition.start();
          console.log('🎤 Voice recognition restarted');
        } catch (error) {
          // Recognition might already be running
          console.log('Voice recognition already running or error:', error);
        }
      }
    }, 200);
  }

  private setupCommands(): void {
    this.commands = [
      // Location-based commands - check these FIRST
      {
        keywords: ['flyga till', 'flyg till', 'åk till', 'till'],
        action: (transcript) => this.handleLocationCommand(transcript || ''),
      },

      // Stop command - prioritize this
      {
        keywords: ['sluta', 'stopp', 'avbryt', 'stanna'],
        action: () => this.clearAllActions(),
      },

      // Altitude control
      {
        keywords: ['upp', 'högre', 'stig', 'höj'],
        action: () => this.activateAction('altitudeUp', true),
        continuous: true,
      },
      {
        keywords: ['ner', 'lägre', 'sjunk', 'sänk'],
        action: () => this.activateAction('altitudeDown', true),
        continuous: true,
      },

      // Turn control
      {
        keywords: ['vänster', 'sväng vänster', 'åt vänster'],
        action: () => this.activateAction('turnLeft', true),
        continuous: true,
      },
      {
        keywords: ['höger', 'sväng höger', 'åt höger'],
        action: () => this.activateAction('turnRight', true),
        continuous: true,
      },

      // Speed control
      {
        keywords: ['gas', 'snabbare', 'öka', 'accelerera', 'fart'],
        action: () => this.activateAction('throttle', true),
        continuous: true,
      },
      {
        keywords: ['bromsa', 'långsammare', 'minska', 'sakta'],
        action: () => this.activateAction('brake', true),
        continuous: true,
      },

      // Roll control
      {
        keywords: ['rulla vänster', 'luta vänster'],
        action: () => this.activateAction('rollLeft', true),
        continuous: true,
      },
      {
        keywords: ['rulla höger', 'luta höger'],
        action: () => this.activateAction('rollRight', true),
        continuous: true,
      },

      // One-time actions
      {
        keywords: ['starta om', 'restart', 'börja om'],
        action: () => this.inputManager.emitAction('restart'),
      },
      {
        keywords: ['byt kamera', 'kamera', 'ändra kamera'],
        action: () => this.inputManager.emitAction('switchCamera'),
      },
      {
        keywords: ['bil', 'byt till bil', 'rover'],
        action: () => this.inputManager.emitAction('toggleRoverMode'),
      },
    ];
  }

  private async handleLocationCommand(transcript: string): Promise<void> {
    console.log('📍 Processing location command:', transcript);

    // Extract location from transcript
    // Look for patterns like "flyga till göteborg", "åk till stockholm centrum"
    const patterns = [
      /(?:flyga? till|åk till|till)\s+(.+)/i,
    ];

    let location = '';
    for (const pattern of patterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        location = match[1].trim();
        break;
      }
    }

    if (!location) {
      console.log('Could not extract location from:', transcript);
      return;
    }

    console.log('🗺️ Extracted location:', location);

    // Call the location callback if registered
    if (this.onLocationRequest) {
      try {
        await this.onLocationRequest(location);
      } catch (error) {
        console.error('Error handling location request:', error);
      }
    } else {
      console.warn('No location request handler registered');
    }
  }

  private processCommand(transcript: string): void {
    console.log('🎤 Voice command:', transcript);

    // Check for location commands first
    if (transcript.includes('flyga till') || transcript.includes('flyg till') ||
        transcript.includes('åk till') || transcript.match(/^till\s+/)) {
      for (const command of this.commands) {
        if (command.keywords.some(kw => transcript.includes(kw))) {
          command.action(transcript);
          return;
        }
      }
    }

    // Check for "stopp" to clear all actions
    if (transcript.includes('stopp') || transcript.includes('sluta') ||
        transcript.includes('stanna') || transcript.includes('avbryt')) {
      this.clearAllActions();
      return;
    }

    // Find matching command
    for (const command of this.commands) {
      for (const keyword of command.keywords) {
        if (transcript.includes(keyword)) {
          command.action(transcript);
          return;
        }
      }
    }

    console.log('❓ No matching command found for:', transcript);
  }

  private activateAction(action: InputAction, continuous: boolean): void {
    if (continuous) {
      this.activeActions.add(action);
      this.inputManager.emitAction(action);

      // Auto-clear after 3 seconds if not refreshed
      setTimeout(() => {
        this.activeActions.delete(action);
      }, 3000);
    } else {
      this.inputManager.emitAction(action);
    }
  }

  private clearAllActions(): void {
    this.activeActions.clear();
    console.log('🛑 All voice actions cleared');
  }

  public setLocationCallback(callback: LocationCallback): void {
    this.onLocationRequest = callback;
  }

  public start(): void {
    if (!this.recognition) {
      console.error('Speech recognition not available');
      return;
    }

    if (this.isListening) {
      return;
    }

    this.isListening = true;
    this.lastTranscript = ''; // Reset last transcript

    try {
      this.recognition.start();
      console.log('🎤 Voice control started');
      if (this.onStatusChange) {
        this.onStatusChange(true);
      }
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      this.isListening = false;
    }
  }

  public stop(): void {
    if (!this.recognition || !this.isListening) {
      return;
    }

    this.isListening = false;
    this.clearAllActions();

    // Clear restart timeout
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    try {
      this.recognition.stop();
      console.log('🔇 Voice control stopped');
      if (this.onStatusChange) {
        this.onStatusChange(false);
      }
    } catch (error) {
      console.error('Failed to stop voice recognition:', error);
    }
  }

  public toggle(): void {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public setStatusChangeCallback(callback: (listening: boolean, transcript?: string) => void): void {
    this.onStatusChange = callback;
  }

  public dispose(): void {
    this.stop();
    this.recognition = null;
    this.commands = [];
    this.activeActions.clear();
    this.onLocationRequest = undefined;
  }
}
