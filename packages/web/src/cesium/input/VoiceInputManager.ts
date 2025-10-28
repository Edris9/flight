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
  action: () => void;
  continuous?: boolean;
}

export class VoiceInputManager {
  private recognition: SpeechRecognition | null = null;
  private isListening = false;
  private inputManager: InputManager;
  private commands: VoiceCommand[] = [];
  private activeActions = new Set<string>();
  private onStatusChange?: (listening: boolean, transcript?: string) => void;

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
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.toLowerCase().trim();

      if (this.onStatusChange) {
        this.onStatusChange(true, transcript);
      }

      this.processCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // These are non-critical errors, continue listening
        return;
      }
      this.stop();
    };

    this.recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening && this.recognition) {
            this.recognition.start();
          }
        }, 100);
      }
    };
  }

  private setupCommands(): void {
    this.commands = [
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
      {
        keywords: ['sluta', 'stopp', 'avbryt'],
        action: () => this.clearAllActions(),
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

  private processCommand(transcript: string): void {
    console.log('Voice command:', transcript);

    // Check for "stopp" first to clear all actions
    if (transcript.includes('stopp') || transcript.includes('sluta')) {
      this.clearAllActions();
      return;
    }

    // Find matching command
    for (const command of this.commands) {
      for (const keyword of command.keywords) {
        if (transcript.includes(keyword)) {
          command.action();
          return;
        }
      }
    }

    console.log('No matching command found for:', transcript);
  }

  private activateAction(action: InputAction, continuous: boolean): void {
    if (continuous) {
      this.activeActions.add(action);
      this.inputManager.emitAction(action);

      // Auto-clear after 2 seconds if not refreshed
      setTimeout(() => {
        this.activeActions.delete(action);
      }, 2000);
    } else {
      this.inputManager.emitAction(action);
    }
  }

  private clearAllActions(): void {
    this.activeActions.clear();
    console.log('All voice actions cleared');
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
    try {
      this.recognition.start();
      console.log('Voice control started');
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

    try {
      this.recognition.stop();
      console.log('Voice control stopped');
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
  }
}
