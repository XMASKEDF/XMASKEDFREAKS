# WAF / Bot Protection Setup

Existing code includes `BotProtectionProvider`, `RiskEngine`, `RateLimitProvider`, local request controls, Turnstile-compatible verification, Admin sensitivity levels `SIMPLE`, `EASY`, `MEDIUM`, and `HARD`, and Sage supervision.

Required invariant:

- GAME BOT DETECTION = OFF
- GAME BOT CHALLENGES = OFF
- GAME ANTI-CHEAT = ON

Cloudflare/Turnstile variables are only used when configured. Provider action is required for managed WAF/DDoS/challenge coverage. Do not re-enable interactive challenges on game routes.
