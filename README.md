# Optical Gate Access System

A web-based gate access system using optical communication. The phone uses its camera to read flashes from a gate device, then uses its screen to flash a response back.

## Features

- **Camera-based detection**: Uses the device's back camera to detect optical flashes
- **Screen-based response**: Flashes the screen (white/black) to send responses
- **Time-based binary encoding**: Decodes 8-bit challenge values using precise timing
- **Automatic protocol handling**: State machine manages the complete communication flow
- **Mobile-first design**: Optimized for mobile devices with full-screen UI

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
  SAMPLE_INTERVAL: 50,     // Brightness sampling interval (ms)
  BRIGHTNESS_THRESHOLD: 100 // ON vs OFF threshold (0-255)
}
```

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
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   │   └── useCamera.js  # Camera initialization hook
│   ├── utils/            # Utility functions
│   │   ├── flashDecoder.js    # Optical flash decoder
│   │   └── screenFlasher.js    # Screen flashing utility
│   ├── App.jsx           # Main application component
│   ├── App.css           # Application styles
│   ├── main.jsx          # Application entry point
│   └── index.css         # Global styles
├── index.html            # HTML template
├── package.json          # Dependencies
├── vite.config.js        # Vite configuration
└── README.md             # This file
```

## Troubleshooting

### Camera not working
- Ensure HTTPS is enabled (required for getUserMedia)
- Check browser permissions for camera access
- Verify device has a back camera

### Flashes not detected
- Ensure good lighting conditions
- Point camera directly at gate device
- Adjust `BRIGHTNESS_THRESHOLD` if needed

### Screen flashing not visible
- Check that full-screen overlay is not blocked
- Verify device supports full-screen color changes
- Ensure no other apps are blocking screen access

## License

Private project - All rights reserved

