import "server-only";
import type { PodProvider } from "@/lib/commerce/pod/types";
import { printifyProvider } from "@/lib/commerce/printify";

export function getPodProvider(provider = "printify"): PodProvider {
  if (provider !== "printify") throw new Error(`Unsupported POD provider: ${provider}`);
  return printifyProvider;
}
