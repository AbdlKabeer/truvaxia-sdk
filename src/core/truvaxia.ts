import { InputTracker } from '../modules/behavioral/input-tracker';
import { LivenessDetector } from '../modules/biometrics/liveness';
import { PolicyClient } from '../modules/policy/policy-client';
import { WidgetManager } from '../modules/ui/widget-manager';
import { DeviceFingerprint } from '../modules/device/fingerprint';

export interface TruvaxiaConfig {
  staffId: string;
  baseUrl?: string;
}

export interface ProcessCallbacks {
  onSuccess: (result: any) => void;
  onFailure: (error: any) => void;
}

export class Truvaxia {
  private static instance: Truvaxia | null = null;
  private config: TruvaxiaConfig | null = null;
  private inputTracker: InputTracker;
  private livenessDetector: LivenessDetector;
  private policyClient: PolicyClient;
  private widgetManager: WidgetManager;
  private deviceFingerprint: DeviceFingerprint;

  private constructor() {
    this.inputTracker = new InputTracker();
    this.livenessDetector = new LivenessDetector();
    this.policyClient = new PolicyClient();
    this.widgetManager = new WidgetManager();
    this.deviceFingerprint = new DeviceFingerprint();
  }

  public static async init(config: TruvaxiaConfig): Promise<Truvaxia> {
    if (!this.instance) {
      this.instance = new Truvaxia();
      this.instance.config = config;
      
      // Preload heavy WASM models in the background
      this.instance.livenessDetector.preload().catch(console.error);
      await this.instance.policyClient.fetchPolicy(config.staffId);
      this.instance.inputTracker.startTracking(config.staffId);
      console.log(`[Truvaxia] SDK initialized for staff: ${config.staffId}`);
    }
    return this.instance;
  }

  public static get liveness() {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");
    return {
      start: async (onProgress?: (stage: string) => void): Promise<MediaStream> => {
        return await this.instance!.livenessDetector.start(onProgress);
      },
      execute: async () => {
        return await this.instance!.livenessDetector.execute();
      }
    };
  }

  /**
   * Universal drop-in widget for identity verification.
   * Mounts the scanner UI, captures biometrics, and handles the backend verification automatically.
   */
  public static async verifyOnboarding(data: any, callbacks: ProcessCallbacks, companyName?: string) {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    const widget = this.instance.widgetManager;
    const liveness = this.instance.livenessDetector;

    let isCancelled = false;
    widget.mount(companyName, () => {
      isCancelled = true;
      callbacks.onFailure({ message: "User cancelled verification" });
    });

    try {
      // 1. Start Camera and await Liveness sequence
      await new Promise<void>((resolve, reject) => {
        liveness.start((stage: string) => {
          if (isCancelled) return;
          switch(stage) {
            case 'BLINK': widget.updateInstruction('Please Blink'); break;
            case 'TURN_LEFT': widget.updateInstruction('Turn Head Left'); break;
            case 'TURN_RIGHT': widget.updateInstruction('Turn Head Right'); break;
            case 'LOOK_STRAIGHT': widget.updateInstruction('Look Straight Ahead'); break;
            case 'TOO_DARK': widget.updateInstruction('Too dark! Move to a brighter area.'); break;
            case 'TOO_BRIGHT': widget.updateInstruction('Too bright! Avoid harsh lighting.'); break;
            case 'OFF_CENTER': widget.updateInstruction('Center your face in the frame'); break;
            case 'TILTED': widget.updateInstruction('Keep your head straight'); break;
            case 'BLURRY': widget.updateInstruction('Hold still, camera is blurry'); break;
            case 'COMPLETED': 
              widget.updateInstruction('Capturing...'); 
              resolve();
              break;
          }
        }).then(stream => {
          if (isCancelled) return;
          const videoElement = widget.showScanning();
          videoElement.srcObject = stream;
        }).catch(reject);
      });

      if (isCancelled) return;

      // Small delay for stability before capture
      await new Promise(r => setTimeout(r, 400));
      if (isCancelled) return;

      const result = await liveness.execute();
      if (!result.success || !result.frameBase64) {
        throw new Error("Liveness capture failed");
      }

      // 2. Show Processing UI
      widget.showProcessing();

      // 3. Gather Telemetry and Make the API Call
      await Promise.all([
        this.instance.deviceFingerprint.requestLocation(),
        this.instance.deviceFingerprint.collectIpTelemetry()
      ]);
      const deviceProfile = this.instance.deviceFingerprint.getProfile();
      const behavioralLogs = this.instance.inputTracker.getSessionData();
      
      const payload = {
        actionType: 'ONBOARDING',
        businessData: { ...data, biometricFrame: result.frameBase64, biometricVideo: result.videoBase64 },
        securityData: {
          behavioral: behavioralLogs,
          device: deviceProfile,
          staffId: this.instance.config?.staffId
        }
      };

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:3002';
      const response = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const backendResult = await response.json();
      
      if (!isCancelled) {
        widget.unmount();
        if (response.ok && backendResult.status === 'APPROVED') {
          callbacks.onSuccess(backendResult);
        } else {
          callbacks.onFailure(backendResult);
        }
      }

    } catch (e) {
      if (!isCancelled) {
        widget.unmount();
        callbacks.onFailure({ message: e instanceof Error ? e.message : 'Unknown error during onboarding' });
      }
    }
  }

  /**
   * Standalone Liveness Screening.
   * Runs only the liveness detection and returns the detailed facial analysis.
   */
  public static async verifyLivenessOnly(callbacks: ProcessCallbacks, companyName?: string) {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    const widget = this.instance.widgetManager;
    const liveness = this.instance.livenessDetector;

    let isCancelled = false;
    widget.mount(companyName, () => {
      isCancelled = true;
      callbacks.onFailure({ message: "User cancelled liveness screening" });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        liveness.start((stage: string) => {
          if (isCancelled) return;
          switch(stage) {
            case 'BLINK': widget.updateInstruction('Please Blink'); break;
            case 'TURN_LEFT': widget.updateInstruction('Turn Head Left'); break;
            case 'TURN_RIGHT': widget.updateInstruction('Turn Head Right'); break;
            case 'LOOK_STRAIGHT': widget.updateInstruction('Look Straight Ahead'); break;
            case 'TOO_DARK': widget.updateInstruction('Too dark! Move to a brighter area.'); break;
            case 'TOO_BRIGHT': widget.updateInstruction('Too bright! Avoid harsh lighting.'); break;
            case 'OFF_CENTER': widget.updateInstruction('Center your face in the frame'); break;
            case 'TILTED': widget.updateInstruction('Keep your head straight'); break;
            case 'BLURRY': widget.updateInstruction('Hold still, camera is blurry'); break;
            case 'COMPLETED': 
              widget.updateInstruction('Capturing...'); 
              resolve();
              break;
          }
        }).then(stream => {
          if (isCancelled) return;
          const videoElement = widget.showScanning();
          videoElement.srcObject = stream;
        }).catch(reject);
      });

      if (isCancelled) return;

      // Small delay for stability before capture
      await new Promise(r => setTimeout(r, 400));
      if (isCancelled) return;

      const result = await liveness.execute();
      if (!result.success || !result.frameBase64) {
        throw new Error("Liveness capture failed");
      }

      widget.showProcessing();

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:3002';
      const response = await fetch(`${baseUrl}/api/v1/analyze-liveness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: result.frameBase64 })
      });

      const backendResult = await response.json();
      
      if (!isCancelled) {
        widget.unmount();
        if (response.ok) {
          callbacks.onSuccess({
            livenessVerified: true,
            frameBase64: result.frameBase64,
            videoBase64: result.videoBase64,
            analysis: backendResult.data
          });
        } else {
          callbacks.onFailure(backendResult);
        }
      }

    } catch (e) {
      if (!isCancelled) {
        widget.unmount();
        callbacks.onFailure({ message: e instanceof Error ? e.message : 'Unknown error during liveness screening' });
      }
    }
  }

  /**
   * Standalone Face Comparison
   * Compares two base64 images and returns the match score.
   */
  public static async compareFaces(payload: { imageBase64_1: string, imageBase64_2: string }): Promise<any> {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");
    try {
      const baseUrl = this.instance?.config?.baseUrl || 'http://localhost:3002';
      const response = await fetch(`${baseUrl}/api/v1/compare-faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to compare faces');
      return result.data;
    } catch (e) {
      console.error("[Truvaxia] Face comparison error:", e);
      throw e;
    }
  }

  /**
   * Liveness + Face Match
   * Runs liveness detection and compares the live frame against a reference image.
   */
  public static async verifyLivenessAndMatch(callbacks: ProcessCallbacks, referenceImageBase64: string, companyName?: string) {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    const widget = this.instance.widgetManager;
    const liveness = this.instance.livenessDetector;

    let isCancelled = false;
    widget.mount(companyName, () => {
      isCancelled = true;
      callbacks.onFailure({ message: "User cancelled liveness and match screening" });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        liveness.start((stage: string) => {
          if (isCancelled) return;
          switch(stage) {
            case 'BLINK': widget.updateInstruction('Please Blink'); break;
            case 'TURN_LEFT': widget.updateInstruction('Turn Head Left'); break;
            case 'TURN_RIGHT': widget.updateInstruction('Turn Head Right'); break;
            case 'LOOK_STRAIGHT': widget.updateInstruction('Look Straight Ahead'); break;
            case 'TOO_DARK': widget.updateInstruction('Too dark! Move to a brighter area.'); break;
            case 'TOO_BRIGHT': widget.updateInstruction('Too bright! Avoid harsh lighting.'); break;
            case 'OFF_CENTER': widget.updateInstruction('Center your face in the frame'); break;
            case 'TILTED': widget.updateInstruction('Keep your head straight'); break;
            case 'BLURRY': widget.updateInstruction('Hold still, camera is blurry'); break;
            case 'COMPLETED': 
              widget.updateInstruction('Capturing...'); 
              resolve();
              break;
          }
        }).then(stream => {
          if (isCancelled) return;
          const videoElement = widget.showScanning();
          videoElement.srcObject = stream;
        }).catch(reject);
      });

      if (isCancelled) return;

      // Small delay for stability before capture
      await new Promise(r => setTimeout(r, 400));
      if (isCancelled) return;

      const result = await liveness.execute();
      if (!result.success || !result.frameBase64) {
        throw new Error("Liveness capture failed");
      }

      widget.showProcessing();

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:3002';
      const response = await fetch(`${baseUrl}/api/v1/liveness-and-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: result.frameBase64, referenceImageBase64 })
      });

      const backendResult = await response.json();
      
      if (!isCancelled) {
        widget.unmount();
        if (response.ok) {
          callbacks.onSuccess({
            ...backendResult.data,
            frameBase64: result.frameBase64,
            videoBase64: result.videoBase64,
          });
        } else {
          callbacks.onFailure(backendResult);
        }
      }

    } catch (e) {
      if (!isCancelled) {
        widget.unmount();
        callbacks.onFailure({ message: e instanceof Error ? e.message : 'Unknown error during liveness and match screening' });
      }
    }
  }


  /**
   * Dynamic Document Extraction
   * Sends an image and a JSON schema to the backend, which parses the image using OCR + Groq LLM
   * and returns perfectly structured JSON.
   */
  public static async extractDocument(payload: { imageBase64: string, schema: Record<string, any> }): Promise<any> {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    try {
      const baseUrl = this.instance?.config?.baseUrl || 'http://localhost:3002';
      const response = await fetch(`${baseUrl}/api/v1/extract-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to extract document data');
      }

      return result.data;
    } catch (e) {
      console.error("[Truvaxia] Document extraction error:", e);
      throw e;
    }
  }

  public static async process(actionType: string, data: any, callbacks: ProcessCallbacks) {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");
    // (Legacy process logic remains here or forwards to verifyOnboarding based on actionType)
    callbacks.onFailure({ message: 'Use verifyOnboarding() for the full widget experience.' });
  }
}
