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
            <h3 style="font-size: 1.25rem; font-weight: 700; color: white; margin: 0;">${companyName || 'Truvaxia'}</h3>
            <p style="font-size: 0.75rem; color: #94a3b8; margin: 0.25rem 0 0 0;">Powered by Truvaxia</p>
          </div>
          <button id="truvaxia-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 0.5rem;">✕</button>
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

  public showProcessing() {
    if (!this.contentBox) return;
    this.contentBox.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; animation: pulse 2s infinite;">
        <div style="width: 4rem; height: 4rem; border-radius: 9999px; border-top: 2px solid transparent; border-right: 2px solid #00ffb2; border-bottom: 2px solid #00ffb2; border-left: 2px solid #00ffb2; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
        <p style="color: #00ffb2; font-weight: 600; letter-spacing: 0.1em;">ANALYZING...</p>
      </div>
    `;
  }

  public unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.videoElement = null;
    this.instructionText = null;
    this.contentBox = null;
  }
}
