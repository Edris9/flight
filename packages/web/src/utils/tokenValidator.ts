const CESIUM_TOKEN_KEY = 'cesium_ion_token';

export interface Tokens {
  cesium: string;
}

export function getTokens(): Tokens {
  const envCesium = import.meta.env.VITE_CESIUM_TOKEN;

  if (envCesium) {
    return {
      cesium: envCesium,
    };
  }

  const localCesium = localStorage.getItem(CESIUM_TOKEN_KEY);

  return {
    cesium: envCesium || localCesium || '',
  };
}

export function hasValidTokens(): boolean {
  const tokens = getTokens();
  return tokens.cesium.length > 0;
}

export function saveTokens(cesium: string): void {
  localStorage.setItem(CESIUM_TOKEN_KEY, cesium);
}

export function clearTokens(): void {
  localStorage.removeItem(CESIUM_TOKEN_KEY);
}


