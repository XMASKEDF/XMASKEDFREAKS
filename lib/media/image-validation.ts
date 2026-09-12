import { createHash } from "crypto";

export const MEDIA_MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

export type ValidatedMediaImage = {
  bytes: Uint8Array;
  extension: "jpg" | "png" | "webp" | "avif" | "gif";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/gif";
  width: number;
  height: number;
  fileSize: number;
  contentHash: string;
  animated: boolean;
};

function text(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24 || text(bytes, 1, 3) !== "PNG") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gifSize(bytes: Uint8Array) {
  if (bytes.length < 10 || !["GIF87a", "GIF89a"].includes(text(bytes, 0, 6))) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frames = 0; for (let index = 0; index < bytes.length; index += 1) if (bytes[index] === 0x2c) frames += 1;
  return { width: view.getUint16(6, true), height: view.getUint16(8, true), animated: frames > 1 };
}

function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    offset += length + 2;
  }
  return null;
}

function webpSize(bytes: Uint8Array) {
  if (bytes.length < 30 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP") return null;
  const chunk = text(bytes, 12, 4);
  if (chunk === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), animated: text(bytes, 0, Math.min(bytes.length, 1_000_000)).includes("ANIM") };
  if (chunk === "VP8 ") return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff, animated: false };
  if (chunk === "VP8L") { const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false }; }
  return null;
}

function avifSize(bytes: Uint8Array) {
  if (bytes.length < 32 || text(bytes, 4, 4) !== "ftyp" || !text(bytes, 8, 24).includes("avif")) return null;
  for (let offset = 0; offset + 20 < bytes.length; offset += 1) {
    if (text(bytes, offset, 4) !== "ispe") continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
  }
  return null;
}

export async function validateMediaImage(file: File): Promise<ValidatedMediaImage> {
  const claimedExtension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.has(claimedExtension)) throw new Error("Unsupported image format.");
  if (!file.size) throw new Error("The image is empty.");
  if (file.size > MEDIA_MAX_FILE_SIZE) throw new Error("This image exceeds the 15 MB limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = pngSize(bytes); const jpeg = png ? null : jpegSize(bytes); const webp = png || jpeg ? null : webpSize(bytes);
  const gif = png || jpeg || webp ? null : gifSize(bytes); const avif = png || jpeg || webp || gif ? null : avifSize(bytes);
  const dimensions = png || jpeg || webp || gif || avif;
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 30000 || dimensions.height > 30000) throw new Error("The file could not be decoded as a valid image.");
  const detected = png ? { extension: "png" as const, mimeType: "image/png" as const, animated: false } : jpeg ? { extension: "jpg" as const, mimeType: "image/jpeg" as const, animated: false } : webp ? { extension: "webp" as const, mimeType: "image/webp" as const, animated: Boolean(webp.animated) } : gif ? { extension: "gif" as const, mimeType: "image/gif" as const, animated: Boolean(gif.animated) } : { extension: "avif" as const, mimeType: "image/avif" as const, animated: false };
  const extensionMatches = detected.extension === "jpg" ? ["jpg", "jpeg"].includes(claimedExtension) : detected.extension === claimedExtension;
  if (!extensionMatches || (file.type && file.type !== detected.mimeType)) throw new Error("The file extension or MIME type does not match the image contents.");
  return { bytes, ...detected, width: dimensions.width, height: dimensions.height, fileSize: file.size, contentHash: createHash("sha256").update(bytes).digest("hex") };
}
