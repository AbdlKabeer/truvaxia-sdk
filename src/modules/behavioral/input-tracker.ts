export interface BehavioralProfile {
  staffId: string;
  sessionStartTime: number;
  keystrokesPerMinute: number;
  pasteEventsCount: number;
  totalKeystrokes: number;
  isAnomalous: boolean;
}

export class InputTracker {
  private staffId: string | null = null;
  private sessionStartTime: number = 0;
  private keystrokeCount: number = 0;
  private pasteCount: number = 0;
  private trackingInterval: ReturnType<typeof setInterval> | null = null;

  public startTracking(staffId: string) {
    if (this.staffId) return; // Already tracking

    this.staffId = staffId;
    this.sessionStartTime = Date.now();
    
    // Attach global listeners for the "Anti-Gravity" behavioral tracking
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('paste', this.handlePaste);
    }

    // Periodically process and batch telemetry
    this.trackingInterval = setInterval(() => {
      this.evaluateTelemetry();
    }, 10000); // Check every 10 seconds
  }

  public stopTracking() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('paste', this.handlePaste);
    }
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    this.staffId = null;
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    // Ignore modifier keys
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
      return;
    }
    this.keystrokeCount++;
  };

  private handlePaste = (event: ClipboardEvent) => {
    // Determine if pasting into sensitive fields (e.g. input type text/number)
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      this.pasteCount++;
    }
  };

  private evaluateTelemetry() {
    if (!this.staffId) return;

    const elapsedMinutes = (Date.now() - this.sessionStartTime) / 60000;
    const kpm = elapsedMinutes > 0 ? this.keystrokeCount / elapsedMinutes : 0;
    
    // Simple Fraud Heuristic:
    // 1. Unhumanly fast typing (e.g., > 300 KPM usually means macro/script)
    // 2. High ratio of pastes vs actual keystrokes
    const isAnomalous = kpm > 300 || this.pasteCount > 3;

    const profile: BehavioralProfile = {
      staffId: this.staffId,
      sessionStartTime: this.sessionStartTime,
      keystrokesPerMinute: Math.round(kpm),
      pasteEventsCount: this.pasteCount,
      totalKeystrokes: this.keystrokeCount,
      isAnomalous
    };

    if (isAnomalous) {
      console.warn(`[Truvaxia:FraudAlert] Anomalous behavior detected for RO: ${this.staffId}`, profile);
      // TODO: Send critical alert to Truvaxia Backend immediately
    }

    // Reset counters for the next window, or keep cumulative based on requirements.
    // For now, let's keep it cumulative for the whole session.
  }

  public getSessionData(): BehavioralProfile {
    const elapsedMinutes = (Date.now() - this.sessionStartTime) / 60000;
    const kpm = elapsedMinutes > 0 ? this.keystrokeCount / elapsedMinutes : 0;
    
    return {
      staffId: this.staffId || '',
      sessionStartTime: this.sessionStartTime,
      keystrokesPerMinute: Math.round(kpm),
      pasteEventsCount: this.pasteCount,
      totalKeystrokes: this.keystrokeCount,
      isAnomalous: kpm > 300 || this.pasteCount > 3
    };
  }
}
