import { cookies } from "next/headers";
import BrandLogo from "@/components/BrandLogo";
import PublicNavigation from "@/components/PublicNavigation";
import { languageCookieName, normalizeLocale } from "@/lib/i18n";
import { getPublishedPolicies } from "@/lib/policies";

export default async function PoliciesPage() {
  const locale = normalizeLocale(cookies().get(languageCookieName)?.value);
  const policies = await getPublishedPolicies(locale);
  return <main className="policies-page"><header className="site-header"><BrandLogo href="/" priority /><PublicNavigation /></header><section className="policies-hero"><p className="kicker">TRUST AND TRANSPARENCY</p><h1>Terms and Policies</h1><p>Review the rules that apply to accounts, content, coins, downloads, physical orders, paintings, privacy, and community participation.</p></section><div className="policies-layout"><nav aria-label="Policy documents">{policies.map((policy) => <a href={`#${policy.slug}`} key={policy.slug}>{policy.title}</a>)}</nav><section className="policy-documents">{policies.map((policy) => <article id={policy.slug} key={policy.slug}><header><h2>{policy.title}</h2><span>{policy.reviewed ? `Version ${policy.version}` : "Requires legal review"}</span></header>{policy.body.split(/\n\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{policy.effectiveAt ? <time dateTime={policy.effectiveAt}>Effective {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(policy.effectiveAt))}</time> : null}</article>)}</section></div></main>;
}
