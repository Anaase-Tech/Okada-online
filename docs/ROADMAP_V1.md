# Okada Online Roadmap V1

## Existing foundation

The current repository already contains a production PWA, Firebase Phone Auth, real-time Firestore integration, rides, driver/owner flows, KYC, payments/fintech, scheduled rides and other mobility modules. The existing backend is a Firebase Functions/Express service and explicitly uses Firebase Phone Auth with no Twilio. fileciteturn7file0L2-L2 fileciteturn8file0L2-L2

## Next build

### 1. Transit foundation
- stations
- routes and stops
- scheduled trips
- vehicle/operator assignment
- segment-aware seat inventory
- transit booking
- digital journey pass

### 2. Journey engine
- multi-segment journeys
- Eastern Region pickup
- Koforidua transfer
- intercity transit
- final-mile pickup
- partner operator options

### 3. VIP Transit
- service classes
- premium fleet metadata
- reserved seating
- luggage rules
- premium pickup/final-mile options

### 4. Okada Time
- GNSS/fleet telemetry
- road/traffic data adapters
- historical travel times
- ETA windows
- arrive-by planning
- connection-risk engine
- punctuality analytics

### 5. Okada Voice
- voice capture
- Khaya provider adapter
- African-language ASR/translation/TTS
- voice journey planning
- confirmation-first actions
- provider abstraction for future African AI integration

### 6. Okada Intelligence
- natural-language journey planning
- option ranking
- fare explanation
- delay/connection explanations
- safe structured intents

## Product principle

Eastern Region first. Deep local operations before geographic expansion. Koforidua is the planned initial transit hub.

## Non-negotiables

- Preserve existing features.
- Preserve Firebase Phone Auth.
- Do not reintroduce Twilio.
- Keep secrets server-side.
- AI never bypasses backend authorization or payment confirmation.
- Do not claim a route, vehicle, partner, ETA or service is live until operationally verified.
- Clearly distinguish estimates from guaranteed commitments.
