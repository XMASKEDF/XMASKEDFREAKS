"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { merchCategoryCustomImage, merchCategoryFallbackImage } from "@/lib/commerce/catalog";
import type { MerchCategory } from "@/lib/commerce/types";

function categoryAltLabel(category: MerchCategory) {
  const slug = category.slug.toLowerCase();
  const labels: Record<string, string> = {
    clothes: "Shirt",
    shirt: "Shirt",
    shirts: "Shirt",
    mug: "Mug",
    mugs: "Mug",
    hoodie: "Hoodie",
    hoodies: "Hoodie",
    hat: "Hat",
    hats: "Hat"
  };
  return labels[slug] || category.name;
}

export default function MerchCategoryEmblem({ category }: { category: MerchCategory }) {
  const candidates = useMemo(() => Array.from(new Set([
    merchCategoryCustomImage(category.slug),
    category.imageUrl,
    merchCategoryFallbackImage(category.slug)
  ].filter((source): source is string => Boolean(source)))), [category.imageUrl, category.slug]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => { setCandidateIndex(0); }, [candidates]);

  const source = candidates[candidateIndex];
  if (!source) return <span aria-hidden="true">{category.icon}</span>;

  return <Image
    className="merch-category-emblem"
    src={source}
    alt={`${categoryAltLabel(category)} merchandise`}
    width={32}
    height={32}
    onError={() => setCandidateIndex((current) => Math.min(current + 1, candidates.length))}
  />;
}
