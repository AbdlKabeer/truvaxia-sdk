import { useEffect, useState } from 'react';
// This is exactly how a customer imports the SDK after `npm install truvaxia-ai-sdk`
import { Truvaxia } from 'truvaxia-ai-sdk';

const API_KEY = import.meta.env.VITE_TRUVAXIA_API_KEY as string | undefined;
const BASE_URL = (import.meta.env.VITE_TRUVAXIA_BASE_URL as string | undefined) ?? 'http://localhost:8000';
const COMPANY = 'Acme Lending';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'success'; result: any }
  | { kind: 'failure'; error: any };

// Photos and videos come back as huge base64 strings: shorten them so the result stays readable
const shorten = (_: string, v: unknown) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 40)}… [${v.length} chars]` : v);

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function ResultCard({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === 'success') {
    return (
      <section className="card result ok" role="status">
        <h2>✅ Success</h2>
        <p className="muted">Your app receives this object in <code>onSuccess</code>:</p>
        <pre>{JSON.stringify(outcome.result, shorten, 2)}</pre>
      </section>
    );
  }
  if (outcome.kind === 'failure') {
    return (
      <section className="card result bad" role="alert">
        <h2>Not completed</h2>
        <p className="muted">{outcome.error?.message ?? 'The check did not complete.'} Your app receives this in <code>onFailure</code>:</p>
        <pre>{JSON.stringify(outcome.error, shorten, 2)}</pre>
      </section>
    );
  }
  return null;
}

export function App() {
  const [sdkState, setSdkState] = useState<'starting' | 'ready' | 'error'>(API_KEY ? 'starting' : 'error');
  const [sdkError, setSdkError] = useState(API_KEY ? '' : 'Add VITE_TRUVAXIA_API_KEY to .env.local and restart.');

  const [form, setForm] = useState({ firstName: 'Ada', lastName: 'Obi', bvn: '22201001' });
  const [onboarding, setOnboarding] = useState<Outcome>({ kind: 'idle' });
  const [liveness, setLiveness] = useState<Outcome>({ kind: 'idle' });
  const [match, setMatch] = useState<Outcome>({ kind: 'idle' });
  const [idPhoto, setIdPhoto] = useState<File | null>(null);

  // 1. Initialize once when the app loads (safe to call again: it returns the same instance)
  useEffect(() => {
    if (!API_KEY) return;
    Truvaxia.init({ apiKey: API_KEY, baseUrl: BASE_URL })
      .then(() => setSdkState('ready'))
      .catch((e) => { setSdkState('error'); setSdkError(String(e?.message ?? e)); });
  }, []);

  const callbacksFor = (set: (o: Outcome) => void) => ({
    onSuccess: (result: any) => set({ kind: 'success', result }),
    onFailure: (error: any) => set({ kind: 'failure', error }),
  });

  // 2a. Full onboarding: liveness + form data + behavior/device signals -> a decision
  const startOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    setOnboarding({ kind: 'working' });
    Truvaxia.verifyOnboarding(form, callbacksFor(setOnboarding), COMPANY);
  };

  // 2b. Liveness only: the camera challenge plus a face analysis. No identity data involved.
  const startLiveness = () => {
    setLiveness({ kind: 'working' });
    Truvaxia.verifyLivenessOnly(callbacksFor(setLiveness), COMPANY);
  };

  // 2c. Liveness + match: also compares the live face with a reference photo (e.g. from an ID card)
  const startMatch = async () => {
    if (!idPhoto) return;
    setMatch({ kind: 'working' });
    Truvaxia.verifyLivenessAndMatch(callbacksFor(setMatch), await toDataUrl(idPhoto), COMPANY);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const ready = sdkState === 'ready';

  return (
    <main className="page">
      <header>
        <div className="logo">Acme Lending</div>
        <span className={`pill ${sdkState}`}>
          {ready ? 'Truvaxia SDK ready' : sdkState === 'starting' ? 'Starting SDK…' : 'SDK not ready'}
        </span>
      </header>

      {sdkError && <div className="alert">{sdkError}</div>}

      {/* ---------- Full onboarding ---------- */}
      <form className="card" onSubmit={startOnboarding}>
        <h1>Open your account</h1>
        <p className="muted">Full onboarding check: selfie liveness plus your details. <code>Truvaxia.verifyOnboarding()</code></p>
        <div className="row">
          <label>First name<input value={form.firstName} onChange={set('firstName')} required /></label>
          <label>Last name<input value={form.lastName} onChange={set('lastName')} required /></label>
        </div>
        <label>BVN<input value={form.bvn} onChange={set('bvn')} inputMode="numeric" required /></label>
        <button type="submit" disabled={!ready || onboarding.kind === 'working'}>
          {onboarding.kind === 'working' ? 'Verification in progress…' : 'Continue and verify'}
        </button>
      </form>
      <ResultCard outcome={onboarding} />

      {/* ---------- Liveness only ---------- */}
      <section className="card">
        <h2>Liveness check only</h2>
        <p className="muted">
          Just confirms a real person is in front of the camera (blink and head turns) and returns a face analysis.
          No identity details. <code>Truvaxia.verifyLivenessOnly()</code>
        </p>
        <button type="button" onClick={startLiveness} disabled={!ready || liveness.kind === 'working'}>
          {liveness.kind === 'working' ? 'Liveness in progress…' : 'Start liveness check'}
        </button>
      </section>
      <ResultCard outcome={liveness} />

      {/* ---------- Liveness + match ---------- */}
      <section className="card">
        <h2>Liveness + ID photo match</h2>
        <p className="muted">
          Same liveness check, then compares the live face with a photo, such as the one on an ID card.
          <code> Truvaxia.verifyLivenessAndMatch()</code>
        </p>
        <label>ID photo (a clear face)
          <input type="file" accept="image/*" onChange={(e) => setIdPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" onClick={startMatch} disabled={!ready || !idPhoto || match.kind === 'working'}>
          {match.kind === 'working' ? 'Checking…' : 'Start liveness + match'}
        </button>
      </section>
      <ResultCard outcome={match} />
    </main>
  );
}
