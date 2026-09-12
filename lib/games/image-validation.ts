const MAX_FILE_SIZE = 2 * 1024 * 1024;
const allowedExtensions = new Set(["png", "jpg", "jpeg", "webp"]);

export type ValidatedImage = {
  bytes: Uint8Array;
  extension: "png" | "jpg" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  fileSize: number;
};

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
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
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const chunk = text(12, 4);
  if (chunk === "VP8X") {
    return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  }
  if (chunk === "VP8 " && bytes.length >= 30) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export async function validateGameThumbnail(file: File): Promise<ValidatedImage> {
  const rawExtension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.has(rawExtension)) throw new Error("Use a PNG, JPEG, or WebP image.");
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new Error("Thumbnail must be larger than 0 bytes and no more than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = pngSize(bytes);
  const jpeg = png ? null : jpegSize(bytes);
  const webp = png || jpeg ? null : webpSize(bytes);
  const dimensions = png || jpeg || webp;
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 12000 || dimensions.height > 12000) throw new Error("The image is corrupted or its dimensions are unsupported.");
  const detected = png ? { extension: "png" as const, mimeType: "image/png" as const } : jpeg ? { extension: "jpg" as const, mimeType: "image/jpeg" as const } : { extension: "webp" as const, mimeType: "image/webp" as const };
  if (file.type && file.type !== detected.mimeType) throw new Error("The file contents do not match the declared image type.");
  if ((rawExtension === "png" && detected.extension !== "png") || (["jpg", "jpeg"].includes(rawExtension) && detected.extension !== "jpg") || (rawExtension === "webp" && detected.extension !== "webp")) throw new Error("The file extension does not match the image contents.");
  return { bytes, ...detected, ...dimensions, fileSize: file.size };
}
