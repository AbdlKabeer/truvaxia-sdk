import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export enum LivenessStage {
  BLINK = 'BLINK',
  TURN_LEFT = 'TURN_LEFT',
  TURN_RIGHT = 'TURN_RIGHT',
  LOOK_STRAIGHT = 'LOOK_STRAIGHT',
  COMPLETED = 'COMPLETED'
}

export class LivenessDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private lastVideoTime: number = -1;
  private isDetecting: boolean = false;
  private animationFrameId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  
  private currentStage: LivenessStage = LivenessStage.BLINK;
  private onProgressCallback?: (stage: string) => void;

  private preloaded: boolean = false;
  private preloadingPromise: Promise<void> | null = null;

  /**
   * Preloads the heavy MediaPipe WASM models without requesting the camera.
   */
  public async preload(): Promise<void> {
    if (this.preloaded) return;
    if (this.preloadingPromise) return this.preloadingPromise;

    console.log('[Truvaxia:Liveness] Preloading MediaPipe WASM in background...');
    this.preloadingPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        this.preloaded = true;
        console.log('[Truvaxia:Liveness] MediaPipe WASM preloaded successfully.');
      } catch (error) {
        console.error('[Truvaxia:Liveness] Failed to preload MediaPipe WASM:', error);
      }
    })();

    return this.preloadingPromise;
  }

  /**
   * Initializes the camera and begins the actual detection loop.
   * This should be called when the user opens the scanner.
   */
  public async start(onProgress?: (stage: string) => void): Promise<MediaStream> {
    console.log('[Truvaxia:Liveness] Starting Liveness module...');
    this.onProgressCallback = onProgress;
    this.currentStage = LivenessStage.BLINK;
    if (this.onProgressCallback) this.onProgressCallback(this.currentStage);

    try {
      // 1. Ensure MediaPipe is loaded
      if (!this.preloaded) {
        await this.preload();
      }

      // 2. Initialize Camera
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('autoplay', '');
      this.videoElement.setAttribute('playsinline', '');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      this.videoElement.srcObject = stream;

      this.recordedChunks = [];
      try {
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };
        this.mediaRecorder.start();
      } catch (e) {
        console.error('[Truvaxia:Liveness] Failed to start MediaRecorder:', e);
      }

      this.videoElement.addEventListener('loadeddata', () => {
        this.isDetecting = true;
        this.detectLoop();
      });

      return stream;
    } catch (error) {
      console.error('[Truvaxia:Liveness] Failed to start camera or load model:', error);
      throw error;
    }
  }

  private advanceStage(nextStage: LivenessStage) {
    this.currentStage = nextStage;
    console.log(`[Truvaxia:Liveness] Advanced to stage: ${nextStage}`);
    if (this.onProgressCallback) {
      this.onProgressCallback(nextStage);
    }
  }

  private lastGatekeeperCheckTime = 0;
  private currentGatekeeperError: string | null = null;

  /**
   * Continuously analyzes the video stream for liveness indicators (e.g., blinking).
   */
  private detectLoop = () => {
    if (!this.isDetecting || !this.videoElement || !this.faceLandmarker) return;

    const startTimeMs = performance.now();
    if (this.lastVideoTime !== this.videoElement.currentTime) {
      this.lastVideoTime = this.videoElement.currentTime;
      const results: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(this.videoElement, startTimeMs);
      
      if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];

        // 1. Run Gatekeeper Checks continuously (throttled to save CPU)
        if (startTimeMs - this.lastGatekeeperCheckTime > 400) {
           this.lastGatekeeperCheckTime = startTimeMs;
           this.currentGatekeeperError = this.runGatekeeperChecks(landmarks);
        }

        if (this.currentGatekeeperError) {
          // Block liveness progression and warn user
          if (this.onProgressCallback) this.onProgressCallback(this.currentGatekeeperError);
        } else {
          // Re-emit current stage in case we just recovered from an error
          if (this.onProgressCallback) this.onProgressCallback(this.currentStage);

          const blendshapes = results.faceBlendshapes[0].categories;
          const leftBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
          const rightBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;

          // Landmarks for head pose heuristic
          const noseX = landmarks[1].x;
          const leftCheekX = landmarks[234].x;
          const rightCheekX = landmarks[454].x;
          
          const distLeft = Math.abs(noseX - leftCheekX);
          const distRight = Math.abs(noseX - rightCheekX);
          const ratio = distLeft / (distRight + 0.0001); // avoid div by 0

          switch(this.currentStage) {
            case LivenessStage.BLINK:
              if (leftBlink > 0.4 && rightBlink > 0.4) {
                this.advanceStage(LivenessStage.TURN_LEFT);
              }
              break;
            case LivenessStage.TURN_LEFT:
              if (ratio < 0.35) {
                this.advanceStage(LivenessStage.TURN_RIGHT);
              }
              break;
            case LivenessStage.TURN_RIGHT:
              if (ratio > 2.5) {
                this.advanceStage(LivenessStage.LOOK_STRAIGHT);
              }
              break;
            case LivenessStage.LOOK_STRAIGHT:
              if (ratio > 0.7 && ratio < 1.3) {
                this.advanceStage(LivenessStage.COMPLETED);
              }
              break;
            case LivenessStage.COMPLETED:
              break;
          }
        }
      }
    }

    if (this.currentStage !== LivenessStage.COMPLETED) {
      this.animationFrameId = requestAnimationFrame(this.detectLoop);
    }
  }

  /**
   * Evaluates Tier 1 (Pixel Math) and Tier 2 (Geometry) quality checks
   */
  private runGatekeeperChecks(landmarks: any): string | null {
    // 1. Centering Check (Tier 2)
    const leftEye = landmarks[33]; // Outer left
    const rightEye = landmarks[263]; // Outer right
    const midX = (leftEye.x + rightEye.x) / 2;
    const midY = (leftEye.y + rightEye.y) / 2;
    if (Math.abs(midX - 0.5) > 0.2 || Math.abs(midY - 0.5) > 0.2) {
      return 'OFF_CENTER';
    }

    // 2. Roll Angle Check (Tier 2)
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    if (angle > 15) {
      return 'TILTED';
    }

    // 3. Pixel Checks (Tier 1)
    if (!this.videoElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 160; // downsample for speed
    canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    
    let sumBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      sumBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
    }
    const avgBrightness = sumBrightness / (canvas.width * canvas.height);
    
    if (avgBrightness < 40) return 'TOO_DARK';
    if (avgBrightness > 240) return 'TOO_BRIGHT';

    // Sharpness (Laplacian variance) on downsampled grayscale
    let mean = 0;
    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      gray[i/4] = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    }
    
    let varianceSum = 0;
    let lapCount = 0;
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = y * canvas.width + x;
        const val = 
          -4 * gray[idx] +
          gray[idx - 1] + gray[idx + 1] +
          gray[idx - canvas.width] + gray[idx + canvas.width];
        varianceSum += val;
        mean += val;
        lapCount++;
      }
    }
    mean /= lapCount;
    let variance = 0;
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = y * canvas.width + x;
        const val = 
          -4 * gray[idx] +
          gray[idx - 1] + gray[idx + 1] +
          gray[idx - canvas.width] + gray[idx + canvas.width];
        variance += (val - mean) * (val - mean);
      }
    }
    variance /= lapCount;

    if (variance < 20) return 'BLURRY'; 

    return null; // Passes all!
  }

  /**
   * Called upon form submission. Evaluates liveness status and captures the frame.
   */
  public async execute(): Promise<{ success: boolean; frameBase64?: string; videoBase64?: string; reason?: string }> {
    console.log('[Truvaxia:Liveness] Executing final validation...');
    this.isDetecting = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.currentStage !== LivenessStage.COMPLETED) {
      return { success: false, reason: 'Liveness check failed: Sequence not completed.' };
    }

    if (!this.videoElement) {
      return { success: false, reason: 'Video stream unavailable.' };
    }

    // Capture the optimal frame
    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    
    let base64Image: string | undefined;
    if (ctx) {
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
      base64Image = canvas.toDataURL('image/jpeg', 0.9);
    }

    let videoBase64: string | undefined;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      videoBase64 = await new Promise<string | undefined>((resolve) => {
        this.mediaRecorder!.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(undefined);
        };
        this.mediaRecorder!.stop();
      });
    }

    // Shut down the camera hardware
    const stream = this.videoElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    this.videoElement.srcObject = null;
    
    if (base64Image) {
      return { success: true, frameBase64: base64Image, videoBase64 };
    }

    return { success: false, reason: 'Failed to extract frame from canvas.' };
  }
}
