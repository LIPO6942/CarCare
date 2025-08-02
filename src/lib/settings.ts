
export interface AppSettings {
  priceEssence: number;
  priceDiesel: number;
  costVisiteTechnique: number;
}

const SETTINGS_KEY = 'carcarepro_settings';

const defaultSettings: AppSettings = {
  priceEssence: 2.5,
  priceDiesel: 2.2,
  costVisiteTechnique: 35,
};

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  try {
    const settingsJson = localStorage.getItem(SETTINGS_KEY);
    if (settingsJson) {
      // Merge saved settings with defaults to ensure all keys are present
      const savedSettings = JSON.parse(settingsJson);
      return { ...defaultSettings, ...savedSettings };
    }
    return defaultSettings;
  } catch (error) {
    console.error("Failed to read settings from localStorage", error);
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings to localStorage", error);
  }
}
