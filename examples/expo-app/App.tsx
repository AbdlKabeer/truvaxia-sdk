import { useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';

/**
 * HOW TRUVAXIA WORKS IN A MOBILE APP
 *
 * The Truvaxia web SDK needs a browser (camera, canvas, DOM), so it can't run inside React Native
 * itself. On mobile you use the hosted verification page in a WebView:
 *
 *   1. Your app asks your server to start a session  ->  POST /api/v1/sessions/initiate
 *   2. The server returns a one-time verification URL
 *   3. The app opens that URL in a full-screen WebView (the page does the liveness check)
 *   4. The page posts the result back with window.ReactNativeWebView.postMessage(...)
 *
 * This example does all four steps. For simplicity it calls /sessions/initiate straight from the app
 * with the org API key; in production put that call on YOUR server so the key never ships in the app.
 */

// On a phone, "localhost" is the phone. In dev we guess your computer's address from Expo's dev server.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const BASE_URL = (process.env.EXPO_PUBLIC_TRUVAXIA_BASE_URL || (devHost ? `http://${devHost}:8000` : 'http://localhost:8000')).replace(/\/$/, '');
const API_KEY = process.env.EXPO_PUBLIC_TRUVAXIA_API_KEY;

type Result =
  | { kind: 'idle' }
  | { kind: 'success'; data: unknown }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' };

// Step 1 + 2: ask the backend for a verification session
async function startSession(person: { firstName: string; lastName: string; idNumber: string }) {
  if (!API_KEY) throw new Error('Add EXPO_PUBLIC_TRUVAXIA_API_KEY to .env and restart Expo.');
  const res = await fetch(`${BASE_URL}/api/v1/sessions/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ actionType: 'ONBOARDING', ...person }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? 'The Truvaxia API key was rejected.'
      : res.status === 402 ? 'The organization is out of verification credit.'
      : typeof body.detail === 'string' ? body.detail : `Could not start verification (${res.status}).`
    );
  }
  return body as { url: string; sessionToken: string };
}

export default function App() {
  const [person, setPerson] = useState({ firstName: 'Ada', lastName: 'Obi', idNumber: '22201001' });
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  const begin = async () => {
    setError('');
    setResult({ kind: 'idle' });
    setBusy(true);
    try {
      // The camera inside the WebView needs the app's own camera permission first
      let granted = permission?.granted ?? false;
      if (!granted) granted = (await requestPermission()).granted;
      if (!granted) {
        setError('Camera access is needed for the selfie check. Enable it in Settings and try again.');
        return;
      }
      const session = await startSession(person);
      setVerifyUrl(session.url); // Step 3: open the hosted page
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Step 4: the verification page reports back
  const onMessage = (event: WebViewMessageEvent) => {
    let message: any;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }

    if (message.status === 'success') setResult({ kind: 'success', data: message.data });
    else if (message.status === 'error') setResult({ kind: 'failed', message: message.message ?? 'Verification failed.' });
    else if (message.status === 'closed') setResult({ kind: 'cancelled' });
    else return;
    setVerifyUrl(null); // close the WebView
  };

  // iOS only allows camera access on secure (https) pages, even inside a WebView
  const insecure = !!verifyUrl && verifyUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(verifyUrl);

  const field = (key: keyof typeof person, label: string, keyboard: 'default' | 'number-pad' = 'default') => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={person[key]}
        onChangeText={(v) => setPerson({ ...person, [key]: v })}
        keyboardType={keyboard}
        autoCapitalize={key === 'idNumber' ? 'none' : 'words'}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Acme Lending</Text>

        <View style={styles.card}>
          <Text style={styles.title}>Open your account</Text>
          <Text style={styles.muted}>Enter your details, then we&apos;ll check it&apos;s really you with a quick selfie.</Text>
          {field('firstName', 'First name')}
          {field('lastName', 'Last name')}
          {field('idNumber', 'BVN', 'number-pad')}

          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          {permission && !permission.granted && !permission.canAskAgain && (
            <Pressable onPress={() => Linking.openSettings()}><Text style={styles.link}>Open Settings</Text></Pressable>
          )}

          <Pressable style={[styles.button, busy && styles.disabled]} onPress={begin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue and verify</Text>}
          </Pressable>
        </View>

        {result.kind === 'success' && (
          <View style={[styles.card, styles.ok]}>
            <Text style={styles.title}>✅ Verified</Text>
            <Text style={styles.muted}>The app received this from the verification page:</Text>
            <Text style={styles.code}>{JSON.stringify(result.data, (_, v) => (typeof v === 'string' && v.length > 80 ? `${v.slice(0, 30)}…` : v), 2)}</Text>
          </View>
        )}
        {result.kind === 'failed' && (
          <View style={[styles.card, styles.bad]}><Text style={styles.title}>Not verified</Text><Text style={styles.muted}>{result.message}</Text></View>
        )}
        {result.kind === 'cancelled' && (
          <View style={styles.card}><Text style={styles.title}>Verification cancelled</Text><Text style={styles.muted}>You closed the check before finishing.</Text></View>
        )}
      </ScrollView>

      <Modal visible={!!verifyUrl} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { setVerifyUrl(null); setResult({ kind: 'cancelled' }); }}>
        {insecure && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              This verification page is served over plain http, so iOS will block the camera. Point the backend&apos;s DASHBOARD_URL at an https address (for example a tunnel or your deployed dashboard).
            </Text>
          </View>
        )}
        {verifyUrl && (
          <WebView
            source={{ uri: verifyUrl }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            // Needed so the page can open the camera without a tap, and show it inline
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            startInLoadingState
            renderLoading={() => <View style={styles.loading}><ActivityIndicator size="large" color="#2563eb" /></View>}
            onError={() => { setVerifyUrl(null); setResult({ kind: 'failed', message: 'We couldn’t load the verification page. Check your connection.' }); }}
            style={{ flex: 1 }}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f9' },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 72 : 56, paddingBottom: 48 },
  brand: { fontSize: 18, fontWeight: '700', color: '#1d4ed8', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  ok: { borderColor: '#86efac' },
  bad: { borderColor: '#fca5a5' },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  muted: { color: '#64748b', marginBottom: 14, fontSize: 14 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0f172a' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.6 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 13 },
  link: { color: '#2563eb', fontWeight: '600', marginBottom: 10 },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#e2e8f0', backgroundColor: '#0f172a', padding: 10, borderRadius: 10 },
  warn: { backgroundColor: '#fffbeb', padding: 14, paddingTop: Platform.OS === 'ios' ? 56 : 32 },
  warnText: { color: '#92400e', fontSize: 12 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
