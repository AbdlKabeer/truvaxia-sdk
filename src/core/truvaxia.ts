import { InputTracker } from '../modules/behavioral/input-tracker';
import { LivenessDetector } from '../modules/biometrics/liveness';
import { PolicyClient } from '../modules/policy/policy-client';
import { WidgetManager } from '../modules/ui/widget-manager';
import { DeviceFingerprint } from '../modules/device/fingerprint';

export interface TruvaxiaConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ProcessCallbacks {
  onSuccess: (result: any) => void;
  onFailure: (error: any) => void;
}

export interface AiConfig {
  provider: 'openai' | 'gemini' | 'groq';
  apiKey: string;
}

export interface RiskAnalysisOptions {
  customerData: Record<string, any>;
  context?: string;
  aiConfig?: AiConfig;
}

export interface RiskAnalysisResponse {
  success: boolean;
  riskLevel?: string;
  repaymentProbabilityScore?: number;
  approvedRecommendation?: boolean;
  reasoning?: string;
  riskFactors?: string[];
  error?: string;
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
      await this.instance.policyClient.fetchPolicy(config.apiKey);
      this.instance.inputTracker.startTracking(config.apiKey);
      console.log(`[Truvaxia] SDK initialized with API Key: ${config.apiKey.substring(0, 8)}...`);
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
          switch (stage) {
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
          apiKey: this.instance.config?.apiKey
        }
      };

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.instance.config?.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      let backendResult: any = {};
      try { backendResult = await response.json(); } catch { /* non-JSON error body */ }

      if (isCancelled) return;

      const decision = backendResult.decision || backendResult.status;
      if (response.ok && decision === 'APPROVE') {
        widget.showSuccess();
        await new Promise(r => setTimeout(r, 1500));
        if (isCancelled) return;
        widget.unmount();
        callbacks.onSuccess({ ...backendResult, score: backendResult.trustScore ?? Math.max(0, 100 - (backendResult.riskScore ?? 0)) });
      } else if (response.ok && decision === 'MANUAL_REVIEW') {
        widget.showSuccess('Submitted for review', 'Your verification needs a quick manual check. You will be notified of the outcome.');
        await new Promise(r => setTimeout(r, 2200));
        if (isCancelled) return;
        widget.unmount();
        callbacks.onFailure({ ...backendResult, message: 'Verification is pending manual review', reasons: backendResult.fraudFlags || [] });
      } else {
        const message = Truvaxia.describeError(response.status, backendResult);
        const retryable = Truvaxia.isRetryable(response.status);
        widget.showError(
          message,
          retryable ? () => { void Truvaxia.verifyOnboarding(data, callbacks, companyName); } : undefined,
          () => callbacks.onFailure({ ...backendResult, message, reasons: backendResult.fraudFlags || [] })
        );
      }

    } catch (e) {
      if (isCancelled) return;
      const message = Truvaxia.describeThrown(e);
      widget.showError(
        message,
        () => { void Truvaxia.verifyOnboarding(data, callbacks, companyName); },
        () => callbacks.onFailure({ message })
      );
    }
  }

  private static isRetryable(status: number): boolean {
    return status >= 500 || status === 429 || status === 422;
  }

  private static describeError(status: number, body: any): string {
    if (status === 401) return 'The Truvaxia API key is invalid. Please contact the site owner.';
    if (status === 402) return 'This service is temporarily unavailable. Please contact the site owner.';
    if (status === 403) return 'Access to verification has been disabled for this account.';
    if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
    // 503 means "temporarily not ready" and the server says why (for example models still loading)
    if (status === 503 && typeof body?.detail === 'string') return body.detail;
    if (status >= 500) return 'Something went wrong on our side. Please try again.';
    if (body?.decision === 'DENY' || body?.status === 'DENY') return 'We were unable to verify your identity.';
    return (typeof body?.detail === 'string' && body.detail) || body?.message || 'We were unable to complete your verification.';
  }

  private static describeThrown(e: unknown): string {
    const name = (e as any)?.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera access was blocked. Allow camera access in your browser settings and try again.';
    }
    if (name === 'NotFoundError') return 'No camera was found on this device.';
    if (name === 'NotReadableError') return 'Your camera is being used by another app. Close it and try again.';
    if (e instanceof TypeError) return 'We couldn\'t reach the server. Check your internet connection and try again.';
    return e instanceof Error ? e.message : 'Unknown error during onboarding';
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
          switch (stage) {
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

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/analyze-liveness`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.instance?.config?.apiKey}`
        },
        body: JSON.stringify({ frameBase64: result.frameBase64, videoBase64: result.videoBase64 })
      });

      let backendResult: any = {};
      try { backendResult = await response.json(); } catch { /* non-JSON error body */ }

      if (isCancelled) return;

      if (response.ok) {
        widget.showSuccess('Liveness confirmed', 'Your face check is complete.');
        await new Promise(r => setTimeout(r, 1500));
        if (isCancelled) return;
        widget.unmount();
        callbacks.onSuccess({
          livenessVerified: true,
          traceId: backendResult.traceId,
          frameBase64: result.frameBase64,
          videoBase64: result.videoBase64,
          analysis: backendResult.data
        });
      } else {
        const message = Truvaxia.describeError(response.status, backendResult);
        widget.showError(
          message,
          Truvaxia.isRetryable(response.status) ? () => { void Truvaxia.verifyLivenessOnly(callbacks, companyName); } : undefined,
          () => callbacks.onFailure({ ...backendResult, message })
        );
      }

    } catch (e) {
      if (isCancelled) return;
      const message = Truvaxia.describeThrown(e);
      widget.showError(
        message,
        () => { void Truvaxia.verifyLivenessOnly(callbacks, companyName); },
        () => callbacks.onFailure({ message })
      );
    }
  }

  /**
   * Standalone Face Comparison
   * Compares two base64 images and returns the match score.
   */
  public static async compareFaces(payload: { imageBase64_1: string, imageBase64_2: string }): Promise<any> {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");
    try {
      const baseUrl = this.instance?.config?.baseUrl || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/compare-faces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.instance?.config?.apiKey}`
        },
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
          switch (stage) {
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

      const baseUrl = this.instance.config?.baseUrl || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/liveness-and-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.instance?.config?.apiKey}`
        },
        body: JSON.stringify({ frameBase64: result.frameBase64, videoBase64: result.videoBase64, referenceImageBase64 })
      });

      let backendResult: any = {};
      try { backendResult = await response.json(); } catch { /* non-JSON error body */ }

      if (isCancelled) return;

      if (response.ok) {
        const matched = backendResult.data?.match === true;
        widget.showSuccess(
          matched ? 'Face matched' : 'Face did not match',
          matched ? 'Your live selfie matches your ID photo.' : 'Your live selfie does not match the ID photo.'
        );
        await new Promise(r => setTimeout(r, 1800));
        if (isCancelled) return;
        widget.unmount();
        callbacks.onSuccess({
          ...backendResult.data,
          frameBase64: result.frameBase64,
          videoBase64: result.videoBase64,
        });
      } else {
        const message = Truvaxia.describeError(response.status, backendResult);
        widget.showError(
          message,
          Truvaxia.isRetryable(response.status) ? () => { void Truvaxia.verifyLivenessAndMatch(callbacks, referenceImageBase64, companyName); } : undefined,
          () => callbacks.onFailure({ ...backendResult, message })
        );
      }

    } catch (e) {
      if (isCancelled) return;
      const message = Truvaxia.describeThrown(e);
      widget.showError(
        message,
        () => { void Truvaxia.verifyLivenessAndMatch(callbacks, referenceImageBase64, companyName); },
        () => callbacks.onFailure({ message })
      );
    }
  }

  public static async extractDocument(payload: { file?: File | Blob | any, imageBase64?: string, schema: Record<string, any>, type?: string }): Promise<any> {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    try {
      const baseUrl = this.instance?.config?.baseUrl || 'http://localhost:8000';
      let response;

      if (payload.file) {
        // Use FormData for binary files
        const formData = new FormData();
        formData.append('document', payload.file as any);
        formData.append('schema', JSON.stringify(payload.schema));
        if (payload.type) formData.append('type', payload.type);

        response = await fetch(`${baseUrl}/api/v1/extract-document`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.instance?.config?.apiKey}`
            // Don't set Content-Type for FormData, fetch will set it with boundary
          },
          body: formData
        });
      } else {
        // Fallback to Base64
        response = await fetch(`${baseUrl}/api/v1/extract-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.instance?.config?.apiKey}`
          },
          body: JSON.stringify({
            imageBase64: payload.imageBase64,
            schema: payload.schema,
            type: payload.type
          })
        });
      }

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

  public static async analyzeRisk(options: RiskAnalysisOptions): Promise<RiskAnalysisResponse> {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");

    try {
      const baseUrl = this.instance?.config?.baseUrl || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/analyze-risk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.instance?.config?.apiKey}`
        },
        body: JSON.stringify(options)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze risk');
      }

      return result;
    } catch (e: any) {
      console.error("[Truvaxia] Risk analysis error:", e);
      return {
        success: false,
        error: e.message || 'Failed to analyze risk'
      };
    }
  }

  public static async process(actionType: string, data: any, callbacks: ProcessCallbacks) {
    if (!this.instance) throw new Error("Truvaxia must be initialized first");
    // (Legacy process logic remains here or forwards to verifyOnboarding based on actionType)
    callbacks.onFailure({ message: 'Use verifyOnboarding() for the full widget experience.' });
  }
}
