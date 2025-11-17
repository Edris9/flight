import type { DroneCommand } from './CommandQueueService';

export interface ParsedVoiceCommand {
  commands: DroneCommand[];
  originalText: string;
}

export class VoiceCommandParser {
  /**
   * Parse Swedish voice commands into drone command queue
   *
   * Examples:
   * - "Flyg till Stockholm"
   * - "Flyg till Stockholm med fort hastighet"
   * - "Flyg till Stockholm och granska området i 2 minuter"
   * - "Flyg till Stockholm med fort hastighet och granska området i 3 minuter sen flyg till Göteborg och vänta tills nästa kommando"
   */
  public parse(text: string): ParsedVoiceCommand {
    const lowerText = text.toLowerCase().trim();
    console.log('🎤 Parsing voice command:', lowerText);

    const commands: DroneCommand[] = [];

    // Split by "sen" or "sedan" to get sequential commands
    const segments = lowerText.split(/\s+(?:sen|sedan)\s+/);

    for (const segment of segments) {
      const segmentCommands = this.parseSegment(segment);
      commands.push(...segmentCommands);
    }

    console.log('📋 Parsed commands:', commands);

    return {
      commands,
      originalText: text
    };
  }

  private parseSegment(segment: string): DroneCommand[] {
    const commands: DroneCommand[] = [];

    // Check for navigation command
    const navMatch = this.extractNavigation(segment);
    if (navMatch) {
      commands.push(navMatch);
    }

    // Check for orbit/scan command
    const orbitMatch = this.extractOrbit(segment);
    if (orbitMatch) {
      commands.push(orbitMatch);
    }

    // Check for wait command
    const waitMatch = this.extractWait(segment);
    if (waitMatch) {
      commands.push(waitMatch);
    }

    return commands;
  }

  private extractNavigation(text: string): DroneCommand | null {
    // Pattern: "flyg(a) till [LOCATION] (med [SPEED] hastighet)"
    const patterns = [
      /(?:flyg[a]?\s+till|åk\s+till)\s+([a-zåäö\s]+?)(?:\s+med\s+(.*?)\s+hastighet)?(?:\s+och|\s*$)/i,
      /(?:flyg[a]?\s+till|åk\s+till)\s+([a-zåäö\s]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const location = match[1].trim();
        const speedText = match[2] ? match[2].trim() : null;

        console.log(`  ✈️ Navigate to: ${location}, speed: ${speedText || 'medium'}`);

        return {
          type: 'navigate',
          location,
          speed: this.parseSpeed(speedText)
        };
      }
    }

    return null;
  }

  private extractOrbit(text: string): DroneCommand | null {
    // Pattern: "granska område(t) i [NUMBER] minut(er)"
    const patterns = [
      /granska\s+omr[aå]det?\s+i\s+(\d+)\s+minut(?:er)?/i,
      /scanna\s+omr[aå]det?\s+i\s+(\d+)\s+minut(?:er)?/i,
      /cirkla\s+i\s+(\d+)\s+minut(?:er)?/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = minutes * 60;

        console.log(`  🔄 Orbit for: ${minutes} minutes (${seconds}s)`);

        return {
          type: 'orbit',
          duration: seconds
        };
      }
    }

    return null;
  }

  private extractWait(text: string): DroneCommand | null {
    // Pattern: "vänta (tills nästa kommando)" or "hover"
    const patterns = [
      /vänta\s+(?:tills|på)\s+nästa\s+kommando/i,
      /vänta\s+i\s+(\d+)\s+(?:sekund(?:er)?|minut(?:er)?)/i,
      /hovra/i,
      /stanna\s+här/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let duration = 999999; // Very long wait (until next command)

        // If specific duration mentioned
        if (match[1]) {
          const value = parseInt(match[1]);
          // Check if minutes or seconds
          if (text.includes('minut')) {
            duration = value * 60;
          } else {
            duration = value;
          }
        }

        console.log(`  ⏸️ Wait for: ${duration === 999999 ? 'next command' : duration + 's'}`);

        return {
          type: 'wait',
          duration: duration === 999999 ? undefined : duration
        };
      }
    }

    return null;
  }

  private parseSpeed(speedText: string | null): 'slow' | 'medium' | 'fast' | 'very_fast' {
    if (!speedText) return 'medium';

    const lowerSpeed = speedText.toLowerCase();

    // Very fast variants
    if (lowerSpeed.match(/(?:mycket\s+)?(?:fort|snabb|hög)/)) {
      return 'very_fast';
    }

    // Fast variants
    if (lowerSpeed.match(/(?:ganska\s+)?(?:fort|snabb)/)) {
      return 'fast';
    }

    // Slow variants
    if (lowerSpeed.match(/(?:lite\s+)?(?:långsam|sakta)/)) {
      return 'slow';
    }

    return 'medium';
  }

  /**
   * Test if a voice command contains navigation instructions
   */
  public isNavigationCommand(text: string): boolean {
    const lowerText = text.toLowerCase();
    return lowerText.includes('flyg till') ||
           lowerText.includes('flyga till') ||
           lowerText.includes('åk till');
  }

  /**
   * Quick test examples
   */
  public static test(): void {
    const parser = new VoiceCommandParser();

    const examples = [
      "Flyg till Stockholm",
      "Flyg till Stockholm med fort hastighet",
      "Flyg till Stockholm och granska området i 2 minuter",
      "Flyg till Stockholm med fort hastighet och granska området i 3 minuter sen flyg till Göteborg och vänta tills nästa kommando",
      "Flygga till Göteborg med mycket fort hastighet och scanna området i 5 minuter sen flyg till Malmö",
    ];

    console.log('🧪 Testing Voice Command Parser:\n');

    for (const example of examples) {
      console.log(`📝 Input: "${example}"`);
      const result = parser.parse(example);
      console.log(`   Commands:`, result.commands);
      console.log('');
    }
  }
}
