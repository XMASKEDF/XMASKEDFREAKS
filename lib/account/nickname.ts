export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 20;

const reservedNames = new Set([
  "admin",
  "administrator",
  "atlas",
  "claude",
  "echo",
  "ledger",
  "maya",
  "moderator",
  "nova",
  "pixel",
  "riley",
  "root",
  "route",
  "sage",
  "staff",
  "support",
  "system",
  "todd",
  "xmaskedfreaks"
]);

const prohibitedFragments = [
  "fuck",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "cunt"
];

export type NicknameValidation = {
  valid: boolean;
  normalized: string;
  code: "AVAILABLE" | "REQUIRED" | "TOO_SHORT" | "TOO_LONG" | "INVALID_CHARACTERS" | "RESERVED" | "PROHIBITED";
  message: string;
};

export function normalizeNicknameInput(value: string) {
  return value.trim();
}

export function validateNickname(value: string): NicknameValidation {
  const normalized = normalizeNicknameInput(value);
  if (!normalized) return { valid: false, normalized, code: "REQUIRED", message: "Nickname is required." };
  if (normalized !== value) return { valid: false, normalized, code: "INVALID_CHARACTERS", message: "Remove spaces before or after the nickname." };
  if (normalized.length < NICKNAME_MIN_LENGTH) return { valid: false, normalized, code: "TOO_SHORT", message: `Use at least ${NICKNAME_MIN_LENGTH} characters.` };
  if (normalized.length > NICKNAME_MAX_LENGTH) return { valid: false, normalized, code: "TOO_LONG", message: `Use no more than ${NICKNAME_MAX_LENGTH} characters.` };
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) return { valid: false, normalized, code: "INVALID_CHARACTERS", message: "Use only letters, numbers, and underscores." };
  const comparable = normalized.toLowerCase();
  if (reservedNames.has(comparable)) return { valid: false, normalized, code: "RESERVED", message: "That nickname is reserved." };
  if (prohibitedFragments.some((fragment) => comparable.includes(fragment))) return { valid: false, normalized, code: "PROHIBITED", message: "Choose a different nickname." };
  return { valid: true, normalized, code: "AVAILABLE", message: "Available" };
}
