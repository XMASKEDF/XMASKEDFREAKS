export const FEET_REQUEST_STATUSES = ["PAID", "RECEIVED", "IN REVIEW", "ACCEPTED", "IN PROGRESS", "COMPLETED", "DECLINED", "REFUNDED", "CANCELED"] as const;
export type FeetRequestStatus = typeof FEET_REQUEST_STATUSES[number];

export const FEET_PRESET_STATUSES = ["DRAFT", "ACTIVE", "HIDDEN", "ARCHIVED"] as const;
export type FeetPresetStatus = typeof FEET_PRESET_STATUSES[number];

export type FeetRequestPreset = {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  description: string;
  coinPrice: number;
  status: FeetPresetStatus;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  downloadMediaId?: string | null;
  downloadFilePath?: string | null;
  downloadMimeType?: string | null;
  downloadExtension?: string | null;
  downloadFileSize?: number | null;
  thumbnailMediaId?: string | null;
};

export type FeetRequest = {
  id: string;
  presetId: string | null;
  customerId: string | null;
  customerReference: string;
  presetName: string;
  presetDescription: string;
  thumbnailUrl: string | null;
  requestDetails: string;
  coinsPaid: number;
  usdValueMinor: number;
  status: FeetRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export const fallbackFeetPresets: FeetRequestPreset[] = [
  { id: "feet-preset-custom-clip", name: "Custom Feet Clip", slug: "custom-feet-clip", thumbnailUrl: "/assets/preview-01.svg", description: "A short custom feet request prepared from the selected brief.", coinPrice: 20, status: "ACTIVE", displayOrder: 1, createdAt: "", updatedAt: "" },
  { id: "feet-preset-soles-focus", name: "Soles Focus", slug: "soles-focus", thumbnailUrl: "/assets/preview-02.svg", description: "A focused request with details confirmed before work begins.", coinPrice: 50, status: "ACTIVE", displayOrder: 2, createdAt: "", updatedAt: "" },
  { id: "feet-preset-custom-set", name: "Custom Feet Set", slug: "custom-feet-set", thumbnailUrl: "/assets/preview-03.svg", description: "A larger request package for a more detailed custom brief.", coinPrice: 100, status: "ACTIVE", displayOrder: 3, createdAt: "", updatedAt: "" }
];

export function coinsToUsdMinor(coins: number) {
  return Math.max(0, Math.floor(coins)) * 50;
}

export function cleanFeetText(value: unknown, maxLength: number) {
  return String(value || "").replace(/[<>]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
}

export function safeFeetStatus(value: unknown): FeetRequestStatus {
  return FEET_REQUEST_STATUSES.includes(String(value) as FeetRequestStatus) ? String(value) as FeetRequestStatus : "RECEIVED";
}

export function safeFeetPresetStatus(value: unknown): FeetPresetStatus {
  return FEET_PRESET_STATUSES.includes(String(value) as FeetPresetStatus) ? String(value) as FeetPresetStatus : "DRAFT";
}
