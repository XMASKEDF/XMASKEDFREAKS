import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-user";
import { LIVE_GUEST_COOKIE, guestSubjectReference } from "@/lib/live/guest-identity";
import { paymentRows } from "@/lib/payments/server";

export async function GET(request: NextRequest, context: { params: { paymentId: string } }) {
  const user = await getApiUser(request);
  const paymentId = context.params.paymentId;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  const identityQuery = user
    ? `user_id=eq.${user.id}`
    : request.cookies.get(LIVE_GUEST_COOKIE)?.value
      ? `guest_reference=eq.${encodeURIComponent(guestSubjectReference(request.cookies.get(LIVE_GUEST_COOKIE)!.value))}`
      : null;
  if (!identityQuery) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  const response = await paymentRows(
    `hosted_payments?id=eq.${paymentId}&${identityQuery}&select=id,status,provider,purpose,package_id,expected_amount_minor,expected_currency,expected_base_coins,expected_bonus_coins,expected_total_coins,created_at,confirmed_at,failure_reason&limit=1`
  ).catch(() => null);
  const [payment] = response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
  if (!payment) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  return NextResponse.json({ payment }, { headers: { "cache-control": "no-store" } });
}
