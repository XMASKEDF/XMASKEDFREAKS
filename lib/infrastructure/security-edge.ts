export {
  getBotProtectionProvider,
  NoopBotProtectionProvider,
  TurnstileCompatibleBotProtectionProvider,
  turnstileConfiguration,
  turnstileMode,
  turnstileStatus
} from "./bot-protection-edge";
export type { BotProtectionDecision, BotProtectionProvider, TurnstileMode } from "./bot-protection-edge";

export type UploadDecision = { status: "QUARANTINED" | "SCANNING" | "SAFE" | "REJECTED"; reason: string };
export interface UploadSecurityProvider { inspect(input: { filename: string; mimeType: string; size: number; bytes?: Uint8Array }): Promise<UploadDecision>; }

type Signature = { extension: string; mimeTypes: string[]; matches: (bytes: Uint8Array) => boolean };
const signatures: Signature[] = [
  { extension: "jpg", mimeTypes: ["image/jpeg"], matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extension: "png", mimeTypes: ["image/png"], matches: (b) => [0x89, 0x50, 0x4e, 0x47].every((value, index) => b[index] === value) },
  { extension: "gif", mimeTypes: ["image/gif"], matches: (b) => new TextDecoder().decode(b.slice(0, 6)) === "GIF89a" || new TextDecoder().decode(b.slice(0, 6)) === "GIF87a" },
  { extension: "webp", mimeTypes: ["image/webp"], matches: (b) => new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WEBP" },
  { extension: "mp3", mimeTypes: ["audio/mpeg", "audio/mp3"], matches: (b) => new TextDecoder().decode(b.slice(0, 3)) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { extension: "aac", mimeTypes: ["audio/aac", "audio/x-aac"], matches: (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  { extension: "wav", mimeTypes: ["audio/wav", "audio/x-wav"], matches: (b) => new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WAVE" },
  { extension: "mp4", mimeTypes: ["video/mp4", "audio/mp4", "audio/x-m4a"], matches: (b) => new TextDecoder().decode(b.slice(4, 8)) === "ftyp" },
  { extension: "webm", mimeTypes: ["video/webm", "audio/webm"], matches: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { extension: "pdf", mimeTypes: ["application/pdf"], matches: (b) => new TextDecoder().decode(b.slice(0, 5)) === "%PDF-" }
];

function signatureFor(extension: string, mimeType: string) {
  return signatures.find((signature) => signature.extension === extension || signature.mimeTypes.includes(mimeType.toLowerCase()));
}

export class BasicUploadSecurityProvider implements UploadSecurityProvider {
  async inspect(input: { filename: string; mimeType: string; size: number; bytes?: Uint8Array }) {
    const extension = input.filename.toLowerCase().split(".").pop() || "";
    const allowed = new Set(signatures.map((signature) => signature.extension).concat(["jpeg", "m4a", "aac"]));
    if (input.size <= 0 || input.size > 250 * 1024 * 1024) return { status: "REJECTED" as const, reason: "File size is outside the approved limit." };
    if (!allowed.has(extension)) return { status: "REJECTED" as const, reason: "File extension is not approved." };
    if (!input.bytes?.byteLength) return { status: "QUARANTINED" as const, reason: "File bytes are unavailable for signature validation." };
    const signature = signatureFor(extension, input.mimeType);
    if (!signature || !signature.matches(input.bytes)) return { status: "REJECTED" as const, reason: "File content does not match its declared type." };

    const scannerUrl = process.env.UPLOAD_SCANNER_URL;
    const scannerToken = process.env.UPLOAD_SCANNER_TOKEN;
    if (!scannerUrl || !scannerToken) return { status: "QUARANTINED" as const, reason: "Awaiting an approved malware scanner; the file is not publishable." };
    const response = await fetch(scannerUrl, { method: "POST", headers: { authorization: `Bearer ${scannerToken}`, "content-type": input.mimeType, "x-filename": input.filename }, body: Buffer.from(input.bytes) }).catch(() => null);
    if (!response?.ok) return { status: "QUARANTINED" as const, reason: "Malware scanner is unavailable; the file remains quarantined." };
    const result = await response.json().catch(() => ({})) as { malicious?: boolean; clean?: boolean };
    if (result.malicious === true || result.clean === false) return { status: "REJECTED" as const, reason: "Malware scanner rejected the upload." };
    return { status: "SAFE" as const, reason: "Signature validation and the configured malware scan passed." };
  }
}
