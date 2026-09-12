import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type PublicPolicy = { slug: string; title: string; body: string; version: number; effectiveAt: string | null; reviewed: boolean };

const draftNotice = "DRAFT FOR LEGAL REVIEW. This operational text must be reviewed by qualified counsel before public launch.";
export const fallbackPolicies: PublicPolicy[] = [
  ["terms","Terms of Service","Access is limited to adults who may lawfully view prerecorded adult entertainment. Accounts, coins, purchases, downloads, community activity, and external destinations must be used honestly and lawfully."],
  ["privacy","Privacy Policy","We limit collection to information needed for accounts, security, transactions, support, preferences, and privacy-conscious analytics. Raw payment credentials are never stored by this platform."],
  ["dmca","DMCA Policy","Rights holders may submit a complete copyright notice through the published support channel. Reports are reviewed before action, and knowingly false notices are prohibited."],
  ["refunds","Refund Policy","Digital access and coins are generally final once delivered or used. Verified duplicate charges, platform-side access failures, cancelled physical orders, and approved returns are reviewed according to the applicable product rules. External-platform purchases are governed by that platform."],
  ["community","Community Rules","Hate speech, threats, harassment, exploitation, prohibited content, impersonation, payment abuse, and attempts to evade safety controls are prohibited."],
  ["cookies","Cookie Policy","Essential cookies support authentication, preferences, security, language, and session continuity. Optional analytics must follow the configured consent rules."],
  ["acceptable-use","Acceptable Use Policy","Do not scrape protected content, attack the service, share access, bypass payment or viewing controls, upload malicious material, or use the platform unlawfully."],
  ["digital-downloads","Digital Download Policy","Digital purchases are licensed to the purchasing account for personal use. Download access may require authentication and must not be redistributed."],
  ["physical-orders","Physical Order Policy","Physical items depend on current inventory and confirmed payment. Customers must provide accurate delivery information. Order status and tracking appear in the customer dashboard."],
  ["paintings","Painting Purchase Policy","Original paintings are unique unless explicitly listed otherwise. A completed sale ends bidding and purchase availability. All published paintings are eligible for international customers."],
  ["auctions","Auction Policy","Valid bids are binding, server time controls closing, anti-sniping extensions may apply, and finalization requires sufficient available coins and a verified account."],
  ["international","International Shipping Notice","International ordering is supported for paintings. Delivery times vary, customs or taxes may apply, and customers are responsible for accurate address information."],
  ["prerecorded","Prerecorded Content Notice","The live-style presentation may contain prerecorded adult entertainment played in a continuous broadcast format."],
  ["age","Age Restriction Notice","Visitors must be at least 18 and legally permitted to access adult content in their location."]
].map(([slug,title,body]) => ({ slug, title, body: `${draftNotice}\n\n${body}`, version: 1, effectiveAt: null, reviewed: false }));

export async function getPublishedPolicies(locale = "en") {
  const service = serviceCredentials();
  if (!service) return fallbackPolicies;
  const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) ? locale : "en";
  const response = await fetch(`${service.url}/rest/v1/policy_documents?select=slug,title,policy_versions(version_number,body_text,effective_at,status,language_code)&policy_versions.status=eq.published&policy_versions.language_code=in.(${language},en)&order=created_at.asc`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return fallbackPolicies;
  const rows = await response.json() as Array<Record<string, unknown>>;
  const mapped = rows.flatMap((row) => {
    const versions = Array.isArray(row.policy_versions) ? row.policy_versions as Array<Record<string, unknown>> : [];
    const version = versions.sort((a, b) => (String(b.language_code) === language ? 1 : 0) - (String(a.language_code) === language ? 1 : 0) || Number(b.version_number) - Number(a.version_number))[0];
    return version ? [{ slug: String(row.slug), title: String(row.title), body: String(version.body_text), version: Number(version.version_number), effectiveAt: version.effective_at ? String(version.effective_at) : null, reviewed: true }] : [];
  });
  return mapped.length ? mapped : fallbackPolicies;
}
