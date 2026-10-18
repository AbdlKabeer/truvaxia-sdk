# Truvaxia SDK examples

| Example | Platform | How it uses Truvaxia |
|---|---|---|
| [`vite-app`](./vite-app) | React (web) | Installs the **packed** `truvaxia-ai-sdk` and calls `Truvaxia.init` / `Truvaxia.verifyOnboarding`. |
| [`expo-app`](./expo-app) | React Native (Expo) | Starts a session on the backend and opens the hosted verification page in a **WebView**. |

## Why the mobile example doesn't import the SDK
The SDK is a browser library: it needs the camera API, canvas and the DOM. React Native has none of those,
so on mobile the verification runs on a hosted web page inside a WebView and reports back to the app
with `postMessage`. Web apps use the SDK directly.

## Run the web example
```bash
cp examples/vite-app/.env.example examples/vite-app/.env.local   # add your API key
npm run example            # packs the SDK, installs it into the app, starts http://localhost:5175
```

## Run the mobile example
```bash
cd examples/expo-app
cp .env.example .env       # add your API key (and backend URL if needed)
npx expo start             # scan the QR code with Expo Go
```
See [`expo-app/README.md`](./expo-app/README.md) for what to configure on a real phone.
