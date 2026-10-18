# truvaxia-ai-sdk

The Truvaxia Client SDK is a powerful, drop-in browser library designed to seamlessly integrate Zero-Trust identity verification and fraud prevention into any web application.

## Core Capabilities

- **Biometric Verification**: Handles camera permissions, face matching, and liveness checks natively through an embedded UI widget.
- **Behavioral Telemetry**: Silently monitors typing cadence (Keystrokes Per Minute), mouse movements, and clipboard events (paste detection).
- **Device Fingerprinting**: Extracts hardware constraints, OS data, browser properties, and canvas fingerprints to detect spoofing or headless automation.
- **Secure Encrypted Payloads**: Packages all telemetry into a secure payload evaluated directly by the Truvaxia AI Backend.

## Installation

```bash
npm install truvaxia-ai-sdk
# or
yarn add truvaxia-ai-sdk
```

## Quick Start

### 1. Initialization
Initialize the SDK globally when your application loads.

```javascript
import { Truvaxia } from 'truvaxia-ai-sdk';

// Initialize the Zero-Trust SDK with your organization API key
Truvaxia.init({ apiKey: 'YOUR_API_KEY', baseUrl: 'https://your-truvaxia-backend' }).catch(console.error);
```

### 2. Launching the Security Widget
Trigger the biometric verification widget when a user submits sensitive data.

```javascript
const formData = { firstName: 'John', lastName: 'Doe', bvn: '12345678901' };

Truvaxia.verifyOnboarding(formData, {
  // Called when the decision is APPROVE. result: { decision, riskScore, sessionToken, fraudFlags }
  onSuccess: (result) => {
    console.log('Verification Passed!', result.score);
  },
  // Called on DENY, MANUAL_REVIEW (result.decision === 'MANUAL_REVIEW'), cancellation or an error
  // the user dismissed. The widget itself shows clear progress, success and error states, and
  // offers "Try again" for temporary failures.
  onFailure: (error) => {
    console.error('Verification not completed:', error.message, error.reasons);
  }
});
```

## Architecture
The SDK is built using vanilla TypeScript and compiles down to both CommonJS and ES Modules, ensuring compatibility with React, Vue, Angular, or vanilla HTML/JS projects.

## Examples
Runnable example apps live in [`examples/`](./examples):
- **React (web)**: `npm run example` installs the packed SDK into a Vite + React app and runs it.
- **React Native (Expo)**: uses the hosted verification page in a WebView, because the SDK itself needs a browser.
