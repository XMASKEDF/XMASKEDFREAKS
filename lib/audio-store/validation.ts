import { createHash } from "crypto";

export const AUDIO_PRODUCT_MAX_BYTES = 250 * 1024 * 1024;
export const AUDIO_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

const formats = {
  mp3: { mimeTypes: ["audio/mpeg", "audio/mp3"], mediaType: "audio" as const },
  m4a: { mimeTypes: ["audio/mp4", "audio/x-m4a", "audio/m4a"], mediaType: "audio" as const },
  wav: { mimeTypes: ["audio/wav", "audio/x-wav", "audio/wave"], mediaType: "audio" as const },
  aac: { mimeTypes: ["audio/aac", "audio/x-aac"], mediaType: "audio" as const },
  mp4: { mimeTypes: ["video/mp4"], mediaType: "video" as const }
};

export type DigitalMediaFormat = keyof typeof formats;

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function detectedFormat(bytes: Uint8Array, extension: string): DigitalMediaFormat | null {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    if ((bytes[1] & 0xf6) === 0xf0) return "aac";
    return "mp3";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") return extension === "mp4" ? "mp4" : "m4a";
  return null;
}

export async function validateDigitalMedia(file: File, preview = false) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!(extension in formats)) throw new Error("Supported product formats are MP3, M4A, WAV, AAC, and MP4.");
  const maximum = preview ? AUDIO_PREVIEW_MAX_BYTES : AUDIO_PRODUCT_MAX_BYTES;
  if (!file.size) throw new Error("The selected media file is empty.");
  if (file.size > maximum) throw new Error(`The selected file exceeds the ${preview ? 50 : 250} MB limit.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectedFormat(bytes, extension);
  if (!detected || detected !== extension) throw new Error("The file contents do not match its extension.");
  const format = formats[detected];
  if (file.type && !format.mimeTypes.includes(file.type)) throw new Error("The file MIME type does not match its contents.");
  return {
    bytes,
    extension: detected,
    mimeType: file.type || format.mimeTypes[0],
    mediaType: format.mediaType,
    fileSize: file.size,
    contentHash: createHash("sha256").update(bytes).digest("hex")
  };
}

export function safeDownloadName(name: string, extension: string) {
  const stem = name.normalize("NFKD").replace(/[^a-z0-9 _-]/gi, "").trim().replace(/\s+/g, "-").slice(0, 100) || "xmaskedfreaks-download";
  return `${stem}.${extension}`;
}

export function safeObjectPath(slot: number, kind: "product" | "preview" | "thumbnail", extension: string) {
  return `slot-${Math.max(1, Math.min(6, Math.floor(slot)))}/${kind}-${crypto.randomUUID()}.${extension.replace(/[^a-z0-9]/gi, "")}`;
}
