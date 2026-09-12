import AudioStorefront from "@/components/audio-store/AudioStorefront";
import { getAudioProducts, publicAudioProduct } from "@/lib/audio-store/catalog";

export const dynamic = "force-dynamic";

export default async function AudioClipsPage() {
  const products = await getAudioProducts(false);
  return <AudioStorefront initialProducts={products.map((product) => publicAudioProduct(product))} />;
}
