import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "LEGACY_PAYMENT_ROUTE_DISABLED",
      message: "This payment route is permanently disabled. Card details and browser-generated payment tokens are not accepted."
    },
    { status: 410, headers: { "cache-control": "no-store" } }
  );
}
