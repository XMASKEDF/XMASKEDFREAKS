export const SPACE_RULES = {
  movementMultiplier: 1.32,
  startingPlayerPower: 1.64,
  roundPowerDecay: 0.97,
  everyThirdRoundBoost: 1.08,
  enemyDamageEveryTwoRounds: 1.1,
  fullLifeUnits: 2,
  normalLifeCapUnits: 6,
  waveRewardTargets: { fast: 30, medium: 90, extended: 135 }
} as const;

type SafeMetadata = Record<string, unknown>;

function numberValue(metadata: SafeMetadata, key: string) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) ? value : null;
}

export function validateGameResult(input: { gameId: string; score: number; sessionSeconds: number; metadata: SafeMetadata }) {
  const reasons: string[] = [];
  const metadata = input.metadata;
  const completed = metadata.completed === true;
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10_000_000) reasons.push("score outside server bounds");
  if (!Number.isInteger(input.sessionSeconds) || input.sessionSeconds < 0 || input.sessionSeconds > 86_400) reasons.push("duration outside server bounds");

  if (input.gameId === "space-sweep") {
    const wave = numberValue(metadata, "wave");
    if (wave !== null) {
      const completedRounds = Math.max(0, Math.floor(wave) - 1);
      const expectedPower = Math.min(1.64, Math.max(0.5, 1.64 * Math.pow(0.97, completedRounds) * (completedRounds > 0 && completedRounds % 3 === 0 ? 1.08 : 1)));
      const expectedEnemyDamage = Math.pow(1.1, Math.floor(completedRounds / 2));
      if (!Number.isInteger(wave) || wave < 1 || wave > 1000) reasons.push("impossible Space Invaders round");
      const playerPower = numberValue(metadata, "playerPower");
      const enemyDamagePower = numberValue(metadata, "enemyDamagePower");
      if (playerPower !== null && Math.abs(playerPower - expectedPower) > 0.08) reasons.push("Space Invaders player power does not match current rules");
      if (enemyDamagePower !== null && Math.abs(enemyDamagePower - expectedEnemyDamage) > 0.08) reasons.push("Space Invaders enemy damage does not match current rules");
    }
    const accuracy = numberValue(metadata, "accuracy");
    if (accuracy !== null && (accuracy < 0 || accuracy > 1)) reasons.push("invalid accuracy");
    for (const key of ["lifeUnits", "speedLifeBonuses", "heartPickups", "highestLifeUnits"] as const) {
      const value = numberValue(metadata, key);
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 4000)) reasons.push(`invalid Space Invaders ${key}`);
    }
    const lifeUnits = numberValue(metadata, "lifeUnits");
    const highestLifeUnits = numberValue(metadata, "highestLifeUnits");
    if (lifeUnits !== null && highestLifeUnits !== null && highestLifeUnits < lifeUnits) reasons.push("Space Invaders life reserve exceeds recorded high-water mark");
  }

  if (completed && input.sessionSeconds === 0 && input.score > 0) {
    // Leaving a run can intentionally record a partial score; only completed
    // runs with no elapsed time are rejected.
    reasons.push("completed game has no elapsed time");
  }
  return { valid: reasons.length === 0, reasons };
}
