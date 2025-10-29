export interface GeocodingResult {
  display_name: string;
  lat: number;
  lon: number;
  boundingbox?: string[];
}

export class LocationService {
  private cache = new Map<string, GeocodingResult>();

  async searchLocation(query: string): Promise<GeocodingResult | null> {
    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Flight-Simulator-App'
          }
        }
      );

      const data = await response.json();

      if (data.length === 0) {
        console.log('No results found for:', query);
        return null;
      }

      const result: GeocodingResult = {
        display_name: data[0].display_name,
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        boundingbox: data[0].boundingbox
      };

      // Cache result
      this.cache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
