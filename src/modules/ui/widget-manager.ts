export class WidgetManager {
  private container: HTMLDivElement | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private instructionText: HTMLParagraphElement | null = null;
  private contentBox: HTMLDivElement | null = null;
  
  public mount(companyName: string | undefined, onClose: () => void) {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'truvaxia-widget-root';
    // Using inline styles heavily to ensure it renders correctly regardless of host CSS, but maintaining Tailwind classes for layout if host has it.
    this.container.setAttribute('style', 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); font-family: ui-sans-serif, system-ui, sans-serif;');
    
    this.container.innerHTML = `
      <div style="width: 100%; max-width: 36rem; border-radius: 1rem; overflow: hidden; border: 1px solid rgba(0,255,178,0.2); background: rgba(10,15,20,0.85); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
        <!-- Header -->
        <div style="padding: 1.5rem; border-bottom: 1px solid rgba(0,255,178,0.2); display: flex; justify-content: space-between; align-items: center; background: rgba(5,10,15,0.9);">
          <div>
            <h3 id="truvaxia-company" style="font-size: 1.25rem; font-weight: 700; color: white; margin: 0;"></h3>
            <p style="font-size: 0.75rem; color: #94a3b8; margin: 0.25rem 0 0 0;">Powered by Truvaxia</p>
          </div>
          <button id="truvaxia-close-btn" aria-label="Close verification" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 0.5rem;">✕</button>
        </div>
        
        <!-- Content -->
        <div id="truvaxia-content" style="padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px;">
           <!-- Dynamic Content Here -->
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    const closeBtn = document.getElementById('truvaxia-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.unmount();
        onClose();
      };
    }
    
    const company = document.getElementById('truvaxia-company');
    if (company) company.textContent = companyName || 'Truvaxia';
    this.contentBox = document.getElementById('truvaxia-content') as HTMLDivElement;
    this.showInitializing();
  }

  public showInitializing() {
    if (!this.contentBox) return;
    this.contentBox.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
        <div style="width: 4rem; height: 4rem; border-radius: 9999px; border-top: 2px solid transparent; border-right: 2px solid #00ffb2; border-bottom: 2px solid #00ffb2; border-left: 2px solid #00ffb2; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
        <p style="color: #00ffb2; font-weight: 500; text-shadow: 0 0 10px rgba(0,255,178,0.5);">Initializing...</p>
      </div>
      <style>
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      </style>
    `;
  }

  public showScanning(): HTMLVideoElement {
    if (!this.contentBox) throw new Error("Widget not mounted");
    this.contentBox.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <div style="position: relative; width: 16rem; height: 16rem; border-radius: 9999px; border: 2px solid rgba(0,255,178,0.5); display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 2rem;">
          <div style="position: absolute; inset: 0; border-top: 4px solid #00ffb2; border-right: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 4px solid transparent; border-radius: 9999px; animation: spin 2s linear infinite; opacity: 0.7; z-index: 10;"></div>
          <video id="truvaxia-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
        </div>
        <div style="padding: 0.75rem 2rem; border-radius: 9999px; display: flex; align-items: center; gap: 0.75rem; background: rgba(5,10,15,0.9); border: 1px solid rgba(0,255,178,0.2);">
          <div style="width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #00ffb2; box-shadow: 0 0 10px #00ffb2; animation: pulse 2s infinite;"></div>
          <p id="truvaxia-instruction" style="color: white; font-weight: 500; letter-spacing: 0.025em; margin: 0;">Please wait...</p>
        </div>
      </div>
    `;
    this.videoElement = document.getElementById('truvaxia-video') as HTMLVideoElement;
    this.instructionText = document.getElementById('truvaxia-instruction') as HTMLParagraphElement;
    return this.videoElement;
  }

  public updateInstruction(text: string) {
    if (this.instructionText) {
      this.instructionText.innerText = text;
    }
  }

  private slowTimer: ReturnType<typeof setTimeout> | null = null;

  private clearSlowTimer() {
    if (this.slowTimer) { clearTimeout(this.slowTimer); this.slowTimer = null; }
  }

  public showProcessing(message: string = 'Securely sending your verification...') {
    if (!this.contentBox) return;
    this.clearSlowTimer();
    this.contentBox.innerHTML = `
      <div role="status" aria-live="polite" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 4rem; height: 4rem; border-radius: 9999px; border-top: 2px solid transparent; border-right: 2px solid #00ffb2; border-bottom: 2px solid #00ffb2; border-left: 2px solid #00ffb2; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
        <p style="color: #00ffb2; font-weight: 600; letter-spacing: 0.05em; margin: 0;">${message}</p>
        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0.5rem 0 0 0;">This usually takes a few seconds. Please don't close this window.</p>
      </div>
      <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
    `;
    this.slowTimer = setTimeout(() => {
      const hint = this.contentBox?.querySelector('p:last-of-type');
      if (hint) hint.textContent = 'Still working. This is taking longer than usual, please keep this window open.';
    }, 10000);
  }

  public showSuccess(title: string = 'Verification complete', detail: string = 'Your identity has been verified.') {
    if (!this.contentBox) return;
    this.clearSlowTimer();
    this.contentBox.innerHTML = `
      <div role="status" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div style="width: 5rem; height: 5rem; border-radius: 9999px; background: rgba(0,255,178,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; animation: tvxpop 0.5s ease-out both;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00ffb2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" style="stroke-dasharray: 30; animation: tvxdraw 0.5s 0.3s ease-out both;"></path></svg>
        </div>
        <p style="color: white; font-size: 1.25rem; font-weight: 700; margin: 0;">${title}</p>
        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0.5rem 0 0 0;">${detail}</p>
      </div>
      <style>
        @keyframes tvxpop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes tvxdraw { from { stroke-dashoffset: 30; } to { stroke-dashoffset: 0; } }
      </style>
    `;
  }

  /**
   * Shows an actionable error. `onRetry` adds a "Try again" button; the close button always dismisses.
   */
  public showError(message: string, onRetry?: () => void, onDismiss?: () => void) {
    if (!this.contentBox) return;
    this.clearSlowTimer();
    this.contentBox.innerHTML = `
      <div role="alert" style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 24rem;">
        <div style="width: 5rem; height: 5rem; border-radius: 9999px; background: rgba(248,113,113,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12"></path></svg>
        </div>
        <p style="color: white; font-size: 1.25rem; font-weight: 700; margin: 0;">Verification unsuccessful</p>
        <p id="truvaxia-error-msg" style="color: #94a3b8; font-size: 0.875rem; margin: 0.5rem 0 1.5rem 0;"></p>
        <div style="display: flex; gap: 0.75rem;">
          <button id="truvaxia-dismiss-btn" style="padding: 0.75rem 1.5rem; border-radius: 0.75rem; border: 1px solid #475569; background: transparent; color: white; font-weight: 500; cursor: pointer;">Close</button>
          ${onRetry ? '<button id="truvaxia-retry-btn" style="padding: 0.75rem 1.5rem; border-radius: 0.75rem; border: none; background: #00ffb2; color: black; font-weight: 700; cursor: pointer;">Try again</button>' : ''}
        </div>
      </div>
    `;
    // textContent avoids injecting server-provided text as HTML
    const msg = document.getElementById('truvaxia-error-msg');
    if (msg) msg.textContent = message;
    const dismiss = document.getElementById('truvaxia-dismiss-btn');
    if (dismiss) dismiss.onclick = () => { this.unmount(); onDismiss?.(); };
    const retry = document.getElementById('truvaxia-retry-btn');
    if (retry && onRetry) retry.onclick = () => { this.unmount(); onRetry(); };
  }

  public unmount() {
    this.clearSlowTimer();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.videoElement = null;
    this.instructionText = null;
    this.contentBox = null;
  }
}
