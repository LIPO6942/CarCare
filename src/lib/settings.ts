
export interface VignetteCost {
    range: string;
    cost: number;
}

export interface AppSettings {
  priceEssence: number;
  priceDiesel: number;
  costVisiteTechnique: number;
  vignetteEssence: VignetteCost[];
  vignetteDiesel: VignetteCost[];
}

const SETTINGS_KEY = 'carcarepro_settings';

const defaultSettings: AppSettings = {
  priceEssence: 2.5,
  priceDiesel: 2.2,
  costVisiteTechnique: 35,
  vignetteEssence: [
    { range: '4', cost: 65 },
    { range: '5-7', cost: 130 },
    { range: '8', cost: 180 },
    { range: '9', cost: 180 },
    { range: '10-11', cost: 230 },
    { range: '12-13', cost: 1050 },
    { range: '14-15', cost: 1400 },
    { range: '16', cost: 2100 },
  ],
  vignetteDiesel: [
    { range: '4', cost: 215 },
    { range: '5-7', cost: 280 },
    { range: '8', cost: 330 },
    { range: '9', cost: 405 },
    { range: '10-11', cost: 455 },
    { range: '12-13', cost: 1275 },
    { range: '14-15', cost: 1625 },
    { range: '16', cost: 2323 },
  ]
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
      // Deep merge for vignette arrays
      const mergedSettings = { ...defaultSettings, ...savedSettings };
      if (savedSettings.vignetteEssence) {
          mergedSettings.vignetteEssence = defaultSettings.vignetteEssence.map(d => {
              const saved = savedSettings.vignetteEssence.find((s:VignetteCost) => s.range === d.range);
              return saved || d;
          })
      }
       if (savedSettings.vignetteDiesel) {
          mergedSettings.vignetteDiesel = defaultSettings.vignetteDiesel.map(d => {
              const saved = savedSettings.vignetteDiesel.find((s:VignetteCost) => s.range === d.range);
              return saved || d;
          })
      }

      return mergedSettings;
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
