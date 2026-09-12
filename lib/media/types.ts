export const MEDIA_STATUSES = ["draft", "published", "private", "archived"] as const;
export type MediaStatus = typeof MEDIA_STATUSES[number];
export const MEDIA_PROCESSING_STATUSES = ["UPLOADING", "UPLOADED", "VALIDATING", "SECURITY_SCAN_PENDING", "QUARANTINED", "PROCESSING", "READY", "FAILED"] as const;
export type MediaProcessingStatus = typeof MEDIA_PROCESSING_STATUSES[number];

export type MediaCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  enabled: boolean;
  archived: boolean;
  displayOrder: number;
  imageCount?: number;
  createdAt?: string;
};

export type MediaFolder = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  archived: boolean;
  imageCount?: number;
  createdAt?: string;
};

export type MediaVariant = {
  id: string;
  mediaId: string;
  storageBucket: string;
  name: "thumbnail" | "small" | "medium" | "large" | "original";
  url: string;
  width: number;
  height: number;
  format: string;
  fileSize: number | null;
};

export type MediaUsage = {
  id: string;
  mediaId: string;
  usageType: string;
  resourceId: string | null;
  route: string | null;
  fieldName: string | null;
  createdAt: string;
};

export type MediaAsset = {
  id: string;
  displayName: string;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  categoryId: string | null;
  folderId: string | null;
  categoryName?: string;
  folderName?: string;
  altText: string;
  description: string;
  tags: string[];
  status: MediaStatus;
  focalPointX: number;
  focalPointY: number;
  cropPreference: string;
  animated: boolean;
  public: boolean;
  contentHash: string;
  uploadedBy: string | null;
  uploadedByName?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  usageCount: number;
  mediaClass?: "IMAGE" | "AUDIO" | "VIDEO";
  processingStatus?: MediaProcessingStatus;
  processingMetadata?: Record<string, unknown>;
  durationSeconds?: number | null;
  container?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrate?: number | null;
  sourceStorageBucket?: string | null;
  sourceStoragePath?: string | null;
  readyStorageBucket?: string | null;
  readyStoragePath?: string | null;
  variants?: MediaVariant[];
  usages?: MediaUsage[];
};

export const DEFAULT_MEDIA_CATEGORIES: MediaCategory[] = [
  ["backgrounds", "Backgrounds", "▧"], ["video-backgrounds", "Video Backgrounds", "▶"], ["interactive-backgrounds", "Interactive Backgrounds", "◎"], ["threejs-presets", "Three.js Presets", "◇"], ["animated-backgrounds", "Animated Backgrounds", "◌"], ["game-thumbnails", "Game Thumbnails", "▣"],
  ["game-assets", "Game Assets", "✦"], ["logos", "Logos", "◇"], ["banners", "Banners", "▬"],
  ["live-page", "Live Page", "●"], ["tip-menu", "Tip Menu", "◉"], ["gallery", "Gallery", "▦"],
  ["merchandise", "Merchandise", "◆"], ["promotional", "Promotional", "✧"],
  ["admin-only", "Admin Only", "◆"], ["other", "Other", "○"]
].map(([slug, name, icon], index) => ({ id: slug, slug, name, icon, description: `${name} image assets.`, enabled: true, archived: false, displayOrder: index + 1 }));

export const DEFAULT_MEDIA_FOLDERS = ["Backgrounds", "Game-Thumbnails", "Game-Assets", "Branding", "Logos", "Banners", "Live", "Tip-Menu", "Gallery", "Promotions", "Mobile", "Archived"];
