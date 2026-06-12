export interface DeviceProfile {
  userAgent: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screenResolution: string;
  timezoneOffset: number;
  timezoneName: string;
  location: {
    lat: number | null;
    lng: number | null;
    permissionGranted: boolean;
  };
}

export class DeviceFingerprint {
  private profile: Partial<DeviceProfile> = {};

  constructor() {
    this.collectBasicTelemetry();
  }

  private collectBasicTelemetry() {
    if (typeof window === 'undefined') return;

    this.profile.userAgent = navigator.userAgent;
    this.profile.language = navigator.language;
    // @ts-ignore - platform might be deprecated but still widely used for fingerprinting
    this.profile.platform = navigator.platform || '';
    this.profile.hardwareConcurrency = navigator.hardwareConcurrency || 0;
    // @ts-ignore - deviceMemory is not available on all browsers
    this.profile.deviceMemory = navigator.deviceMemory || 0;
    
    if (window.screen) {
      this.profile.screenResolution = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    }

    this.profile.timezoneOffset = new Date().getTimezoneOffset();
    this.profile.timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Prompts the user for location access and returns the current coordinates.
   * If denied, records that permission was refused.
   */
  public async requestLocation(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.profile.location = { lat: null, lng: null, permissionGranted: false };
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });

      this.profile.location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        permissionGranted: true
      };
    } catch (error) {
      console.warn('[Truvaxia] Location access denied or timed out.', error);
      this.profile.location = { lat: null, lng: null, permissionGranted: false };
    }
  }

  public getProfile(): DeviceProfile {
    // Return a complete profile, defaulting to empty/null if basic collection failed
    return {
      userAgent: this.profile.userAgent || 'unknown',
      language: this.profile.language || 'unknown',
      platform: this.profile.platform || 'unknown',
      hardwareConcurrency: this.profile.hardwareConcurrency || 0,
      deviceMemory: this.profile.deviceMemory || 0,
      screenResolution: this.profile.screenResolution || 'unknown',
      timezoneOffset: this.profile.timezoneOffset || 0,
      timezoneName: this.profile.timezoneName || 'unknown',
      location: this.profile.location || { lat: null, lng: null, permissionGranted: false }
    };
  }
}
