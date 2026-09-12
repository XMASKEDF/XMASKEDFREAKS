import { defaultGames, type GameItem } from "@/lib/config";
import { DEFAULT_GAME_TUNING, normalizeGameTuning } from "@/lib/games/settings";

type CatalogRow = {
  id: string;
  slug?: string | null;
  title: string;
  kind: GameItem["kind"];
  category: string;
  difficulty: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_alt?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  thumbnail_mime_type?: string | null;
  thumbnail_file_size?: number | null;
  thumbnail_updated_at?: string | null;
  thumbnail_updated_by?: string | null;
  featured: boolean;
  hidden: boolean;
  enabled: boolean;
  display_order: number;
  updated_at?: string;
};

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function fromRow(row: CatalogRow): GameItem {
  const fallback = defaultGames.find((game) => game.id === row.id);
  const enforcedTitle = row.id === "space-sweep" || row.id === "slither" ? fallback?.title : row.title;
  return {
    id: row.id,
    slug: row.slug || fallback?.slug || row.id,
    title: enforcedTitle || row.title,
    kind: row.kind,
    category: row.category,
    difficulty: row.difficulty,
    description: row.id === "slither" ? fallback?.description : row.description || fallback?.description,
    thumbnail: row.thumbnail_url || fallback?.thumbnail,
    thumbnailRegion: row.thumbnail_url ? undefined : fallback?.thumbnailRegion,
    thumbnailAlt: row.thumbnail_alt || fallback?.thumbnailAlt || `${enforcedTitle || row.title} game thumbnail.`,
    thumbnailWidth: row.thumbnail_width || undefined,
    thumbnailHeight: row.thumbnail_height || undefined,
    thumbnailMimeType: row.thumbnail_mime_type || undefined,
    thumbnailFileSize: row.thumbnail_file_size || undefined,
    thumbnailUpdatedAt: row.thumbnail_updated_at || row.updated_at,
    thumbnailUpdatedBy: row.thumbnail_updated_by || undefined,
    featured: row.featured,
    hidden: row.hidden,
    enabled: row.enabled,
    order: row.display_order
  };
}

export async function getGameCatalog(): Promise<GameItem[]> {
  const service = credentials();
  if (!service) return defaultGames;

  const response = await fetch(`${service.url}/rest/v1/game_catalog?select=*&order=display_order.asc`, {
    next: { revalidate: 60, tags: ["public:games"] },
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  }).catch(() => null);

  if (!response?.ok) return defaultGames;
  const parsed = await response.json().catch(() => []);
  const rows = Array.isArray(parsed) ? parsed.filter((row): row is CatalogRow => Boolean(row && typeof row === "object" && typeof row.id === "string" && typeof row.title === "string" && ["space", "pacman", "slither"].includes(row.kind))) : [];
  if (!rows.length) return defaultGames;

  const configured = rows.map(fromRow);
  const missing = defaultGames.filter((fallback) => !configured.some((game) => game.id === fallback.id));
  return [...configured, ...missing].sort((a, b) => a.order - b.order);
}

export async function getGamesEnabled(): Promise<boolean> {
  const service = credentials();
  if (!service) return DEFAULT_GAME_TUNING.gamesEnabled;

  const response = await fetch(`${service.url}/rest/v1/game_runtime_settings?id=eq.default&select=settings&limit=1`, {
    next: { revalidate: 15, tags: ["public:games-settings"] },
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  }).catch(() => null);

  if (!response?.ok) return DEFAULT_GAME_TUNING.gamesEnabled;
  const parsed = await response.json().catch(() => []);
  const rows = Array.isArray(parsed) ? parsed as Array<{ settings?: Partial<typeof DEFAULT_GAME_TUNING> }> : [];
  return normalizeGameTuning(rows[0]?.settings).gamesEnabled;
}

export async function getGameBySlug(slug: string) {
  const [gamesEnabled, games] = await Promise.all([getGamesEnabled(), getGameCatalog()]);
  if (!gamesEnabled) return null;
  return games.find((game) => game.slug === slug && game.enabled && !game.hidden) || null;
}

export async function getGameById(id: string) {
  const games = await getGameCatalog();
  return games.find((game) => game.id === id) || null;
}

export async function getGlobalBestScores(): Promise<Record<string, number>> {
  const service = credentials();
  if (!service) return { "space-sweep": 18400, "pac-mask": 12880, slither: 42100 };
  const response = await fetch(`${service.url}/rest/v1/game_scores?select=game_id,score&order=score.desc&limit=500`, {
    next: { revalidate: 15, tags: ["public:game-scores"] },
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  }).catch(() => null);
  if (!response?.ok) return { "space-sweep": 18400, "pac-mask": 12880, slither: 42100 };
  const parsed = await response.json().catch(() => []);
  const rows = Array.isArray(parsed) ? parsed as Array<{ game_id: string; score: number }> : [];
  return rows.reduce<Record<string, number>>((best, row) => {
    best[row.game_id] = Math.max(best[row.game_id] || 0, Number(row.score) || 0);
    return best;
  }, {});
}

export async function getGameLeaderboardScores(gameId: string, limit = 100): Promise<number[]> {
  const safeGameId = gameId.replace(/[^a-z0-9_-]/gi, "");
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const service = credentials();
  if (!service) return [getGlobalBestFallback(gameId)];
  const response = await fetch(`${service.url}/rest/v1/game_scores?select=score&game_id=eq.${safeGameId}&order=score.desc&limit=${safeLimit}`, {
    next: { revalidate: 15, tags: [`public:game-scores:${safeGameId}`] },
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  }).catch(() => null);
  if (!response?.ok) return [getGlobalBestFallback(gameId)];
  const parsed = await response.json().catch(() => []);
  const rows = Array.isArray(parsed) ? parsed as Array<{ score: number }> : [];
  return rows.map((row) => Number(row.score) || 0).filter((score) => score > 0);
}

function getGlobalBestFallback(gameId: string) {
  return ({ "space-sweep": 18400, "pac-mask": 12880, slither: 42100 } as Record<string, number>)[gameId] || 0;
}

export function getDefaultGame(id: string) {
  return defaultGames.find((game) => game.id === id) || null;
}

export function gameServiceCredentials() {
  return credentials();
}
