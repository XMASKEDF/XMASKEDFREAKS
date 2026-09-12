import type { NextRequest } from "next/server";

export type ApiUser = { id: string; email?: string };

export function serviceCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && serviceKey ? { url, serviceKey, anonKey: anonKey || serviceKey } : null;
}

export async function getApiUser(request: NextRequest): Promise<ApiUser | null> {
  const service = serviceCredentials();
  const authorization = request.headers.get("authorization");
  if (!service || !authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${service.url}/auth/v1/user`, {
    cache: "no-store",
    headers: { apikey: service.anonKey, authorization }
  }).catch(() => null);
  if (!response?.ok) return null;
  const user = await response.json() as { id?: string; email?: string };
  return user.id ? { id: user.id, email: user.email } : null;
}

export function serviceHeaders(service: NonNullable<ReturnType<typeof serviceCredentials>>, prefer?: string) {
  return {
    apikey: service.serviceKey,
    authorization: `Bearer ${service.serviceKey}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {})
  };
}
