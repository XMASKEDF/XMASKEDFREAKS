# Streaming Provider Setup

The repository exposes provider-neutral streaming and health interfaces. XMASKEDFREAKS handles page/player integration, live status consumption, chat/tip UI, access rules, and health reporting. A selected provider must handle OBS ingest, transcoding, distribution, recording/loop delivery as applicable, and callbacks.

Status: **PROVIDER SELECTION REQUIRED**.

Owner action: select a provider, obtain credentials, configure `STREAMING_PROVIDER`, `STREAM_HEALTH_URL`, `STREAM_PLAYBACK_BASE_URL`, and OBS status integration. Verify live/offline transitions and failure recovery in staging.
