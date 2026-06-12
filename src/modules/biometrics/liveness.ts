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
        const blendshapes = results.faceBlendshapes[0].categories;
        const landmarks = results.faceLandmarks[0];
        
        const leftBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
        const rightBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;

        // Landmarks for head pose heuristic (using X coordinates which are 0.0 to 1.0)
        // Nose tip: 1, Left cheek edge: 234, Right cheek edge: 454
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
            if (ratio < 0.35) { // User turned head one way
              this.advanceStage(LivenessStage.TURN_RIGHT);
            }
            break;
          case LivenessStage.TURN_RIGHT:
            if (ratio > 2.5) { // User turned head the other way
              this.advanceStage(LivenessStage.LOOK_STRAIGHT);
            }
            break;
          case LivenessStage.LOOK_STRAIGHT:
            if (ratio > 0.7 && ratio < 1.3) { // User is looking straight again
              this.advanceStage(LivenessStage.COMPLETED);
            }
            break;
          case LivenessStage.COMPLETED:
            // Ready for capture
            break;
        }
      }
    }

    if (this.currentStage !== LivenessStage.COMPLETED) {
      this.animationFrameId = requestAnimationFrame(this.detectLoop);
    }
  }

  /**
   * Called upon form submission. Evaluates liveness status and captures the frame.
   */
  public async execute(): Promise<{ success: boolean; frameBase64?: string; reason?: string }> {
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

    // Shut down the camera hardware
    const stream = this.videoElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    this.videoElement.srcObject = null;
    
    if (base64Image) {
      return { success: true, frameBase64: base64Image };
    }

    return { success: false, reason: 'Failed to extract frame from canvas.' };
  }
}
