# @truvaxia/sdk

The Truvaxia Client SDK is a powerful, drop-in browser library designed to seamlessly integrate Zero-Trust identity verification and fraud prevention into any web application.

## Core Capabilities

- **Biometric Verification**: Handles camera permissions, face matching, and liveness checks natively through an embedded UI widget.
- **Behavioral Telemetry**: Silently monitors typing cadence (Keystrokes Per Minute), mouse movements, and clipboard events (paste detection).
- **Device Fingerprinting**: Extracts hardware constraints, OS data, browser properties, and canvas fingerprints to detect spoofing or headless automation.
- **Secure Encrypted Payloads**: Packages all telemetry into a secure payload evaluated directly by the Truvaxia AI Backend.

## Installation

```bash
npm install @truvaxia/sdk
# or
yarn add @truvaxia/sdk
```

## Quick Start

### 1. Initialization
Initialize the SDK globally when your application loads.

```javascript
import { Truvaxia } from '@truvaxia/sdk';

// Initialize the Zero-Trust SDK
Truvaxia.init({ staffId: 'USER_1234' }).catch(console.error);
```

### 2. Launching the Security Widget
Trigger the biometric verification widget when a user submits sensitive data.

```javascript
const formData = { firstName: 'John', lastName: 'Doe', bvn: '12345678901' };

Truvaxia.verifyOnboarding(formData, {
  onSuccess: (result) => {
    console.log('Verification Passed!', result.score);
  },
  onFailure: (error) => {
    console.error('Verification Failed!', error.reasons);
  }
});
```

## Architecture
The SDK is built using vanilla TypeScript and compiles down to both CommonJS and ES Modules, ensuring compatibility with React, Vue, Angular, or vanilla HTML/JS projects.
