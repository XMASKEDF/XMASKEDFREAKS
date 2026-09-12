import HostedPaymentReturn from "@/components/payments/HostedPaymentReturn";

export default function PaymentReturnPage({ params, searchParams }: { params: { paymentId: string }; searchParams?: { returnTo?: string; cancelled?: string } }) {
  return <HostedPaymentReturn paymentId={params.paymentId} returnTo={searchParams?.returnTo === "/live" ? "/live" : undefined} cancelled={searchParams?.cancelled === "1"} />;
}
