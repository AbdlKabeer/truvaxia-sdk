# Truvaxia + Expo (React Native) example

A signup screen that verifies the user with a selfie check.

## The flow
```
App ──POST /api/v1/sessions/initiate──▶ Your server / Truvaxia API
App ◀────────── { url, sessionToken } ─┘
App opens `url` in a WebView ──▶ hosted page runs liveness, submits
App ◀── window.ReactNativeWebView.postMessage({ status: 'success' | 'error' | 'closed', data }) ──
```
All of it is in [`App.tsx`](./App.tsx) (`startSession` and `onMessage` are the parts to copy).

## Run it
```bash
cp .env.example .env     # set EXPO_PUBLIC_TRUVAXIA_API_KEY
npx expo start           # then open in Expo Go (iOS or Android)
```

## Things you must get right on a real phone
1. **Reachable backend.** `localhost` on a phone is the phone. Set `EXPO_PUBLIC_TRUVAXIA_BASE_URL` to your
   computer's LAN IP (`http://192.168.x.x:8000`). If you leave it empty the app guesses it from Expo.
2. **https for the verification page.** iOS only allows the camera on secure pages. The URL returned by
   `/sessions/initiate` is built from the backend's `DASHBOARD_URL`, so point that at an https address
   (your deployed dashboard, or a tunnel such as ngrok while developing). The app warns you if it's plain http.
3. **Camera permission.** The app asks for it before opening the WebView (`expo-camera`). The iOS usage text
   is set in `app.json` through the `expo-camera` config plugin.
4. **Don't ship the API key.** The example calls `/sessions/initiate` from the app to stay simple. In
   production, call it from your own server and return only the `url` to the app.
