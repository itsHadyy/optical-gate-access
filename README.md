# Optical Gate Access System

A web-based gate access system using optical communication. The phone uses its camera to read flashes from a gate device, then uses its screen to flash a response back.

## Features

- **Camera-based detection**: Uses the device's back camera to detect optical flashes
- **Screen-based response**: Flashes the screen (white/black) to send responses
- **Time-based binary encoding**: Decodes 8-bit challenge values using precise timing
- **Automatic protocol handling**: State machine manages the complete communication flow
- **Mobile-first design**: Optimized for mobile devices with full-screen UI
- **Gate Simulator**: Built-in testing page to simulate the gate device (use on laptop for testing)

## Technology Stack

- **React 18** with Hooks
- **Vite** for fast development and building
- **getUserMedia API** for camera access
- **Canvas API** for frame sampling
- **requestAnimationFrame** for precise screen flashing

## Installation

```bash
cd optical-gate-access
npm install
```

## Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Pages

- **Phone App** (`/phone`): The main app for mobile devices to detect gate signals and respond
- **Gate Simulator** (`/gate`): Testing page to simulate the gate device (use on laptop)

Use the navigation bar at the top to switch between pages.

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## How It Works

### Optical Protocol

**Gate sends:**
1. START signal: light ON for 1000ms
2. 8 bits (MSB first), each bit lasts 300ms
   - 1 = light ON
   - 0 = light OFF
3. END signal: light OFF for 1000ms

**Phone responds:**
- Same protocol
- Full-screen white = ON
- Full-screen black = OFF

### Challenge-Response Flow

1. Gate sends an 8-bit challenge (0-255)
2. Phone decodes the challenge using camera
3. Phone computes response: `(challenge + 10) % 256`
4. Phone flashes response back using screen
5. Gate verifies response and grants/denies access

### State Machine

The app uses a state machine with the following states:

- **IDLE**: Initial state
- **DETECT_START**: Waiting for gate's START signal
- **READ_BITS**: Reading 8-bit challenge
- **COMPUTE**: Computing response
- **TRANSMIT**: Flashing response to gate
- **DONE**: Communication complete

## Configuration

Timing values can be configured in `src/utils/flashDecoder.js`:

```javascript
export const TIMING_CONFIG = {
  START_DURATION: 1000,    // Duration of START signal (ms)
  BIT_DURATION: 300,       // Duration of each bit (ms)
  END_DURATION: 1000,      // Duration of END signal (ms)
  SAMPLE_INTERVAL: 33,     // Target 30 fps sampling (1000/30 ≈ 33ms), actual ~60fps with RAF
  BRIGHTNESS_CHANGE_THRESHOLD: 50, // Minimum brightness change to detect ON (differential detection)
  BASELINE_SAMPLES: 30,    // Number of samples to calculate baseline brightness (1 second at 30fps)
  RESPONSE_DELAY: 3000     // Delay between receiving challenge and sending response (ms)
}
```

## Detection Features

### Differential Detection
- **Baseline Calibration**: The system automatically calibrates baseline brightness (~1 second) before detection
- **Change-Based Detection**: Only detects light changes from the device, not ambient light
- **30+ FPS Sampling**: Uses `requestAnimationFrame` for smooth 30+ fps sampling (typically 60fps)
- **8-Bit Validation**: Ensures exactly 8 bits are received and validates bit values

### How It Works
1. **Calibration Phase**: Collects 30 baseline samples (~1 second) to establish ambient brightness
2. **Detection Phase**: Compares current brightness to baseline - only triggers when brightness change exceeds threshold
3. **8-Bit Reading**: Reads exactly 8 bits, each lasting 300ms, with proper validation
4. **Protocol Compliance**: Follows strict timing: START (1000ms) → 8 bits (300ms each) → END (1000ms)

**Note**: The `RESPONSE_DELAY` gives users time to position their phone screen correctly before the response is sent. During this delay, users will see:
- A countdown timer showing remaining seconds
- Clear instructions to point the phone screen at the gate
- Visual feedback to ensure proper positioning

## Browser Requirements

- Modern browser with getUserMedia support
- HTTPS required for camera access (or localhost for development)
- Mobile device with back camera
- Screen capable of displaying full-screen colors

## Permissions

The app requires:
- **Camera permission**: To read optical flashes from the gate
- **Full-screen access**: To flash responses

## Project Structure

```
optical-gate-access/
├── src/
│   ├── components/              # React components
│   │   ├── PhoneApp.jsx         # Phone application (detects & responds)
│   │   ├── PhoneApp.css        # Phone app styles
│   │   ├── GateSimulator.jsx   # Gate simulator (sends & receives)
│   │   ├── GateSimulator.css   # Gate simulator styles
│   │   ├── Navigation.jsx      # Navigation component
│   │   └── Navigation.css      # Navigation styles
│   ├── hooks/                   # Custom React hooks
│   │   └── useCamera.js         # Camera initialization hook
│   ├── utils/                   # Utility functions
│   │   ├── flashDecoder.js     # Optical flash decoder
│   │   ├── screenFlasher.js     # Screen flashing utility
│   │   ├── gateFlashSender.js   # Gate flash sender
│   │   └── gateFlashReceiver.js # Gate flash receiver
│   ├── App.jsx                  # Main router component
│   ├── App.css                  # Router styles
│   ├── main.jsx                 # Application entry point
│   └── index.css                # Global styles
├── index.html                   # HTML template
├── package.json                 # Dependencies
├── vite.config.js               # Vite configuration
└── README.md                    # This file
```

## Testing with Gate Simulator

1. **On your laptop**: Open the app and navigate to `/gate` (Gate Simulator)
2. **On your phone**: Open the app and navigate to `/phone` (Phone App)
3. **Setup**:
   - Point your laptop camera at the phone screen
   - Point your phone's back camera at the laptop screen
4. **Test flow**:
   - On laptop: Click "Send Challenge" (or use random challenge)
   - Laptop screen will flash the challenge
   - Phone should automatically detect and respond
   - On laptop: Click "Start Listening" to detect phone's response
   - Response will be verified automatically

The gate simulator shows:
- Real-time brightness detection from camera
- Challenge sent and response received
- Automatic verification of the response
- Expected vs actual response comparison

## Troubleshooting

### Camera not working
- Ensure HTTPS is enabled (required for getUserMedia)
- Check browser permissions for camera access
- Verify device has a camera (back camera for phone, any camera for laptop)

### Flashes not detected
- Ensure good lighting conditions
- Point camera directly at the flashing screen
- Adjust `BRIGHTNESS_THRESHOLD` if needed (in `flashDecoder.js`)
- For gate simulator: Ensure phone screen is bright and visible to laptop camera

### Screen flashing not visible
- Check that full-screen overlay is not blocked
- Verify device supports full-screen color changes
- Ensure no other apps are blocking screen access
- For testing: Make sure both screens are visible to each other's cameras

## License

Private project - All rights reserved

