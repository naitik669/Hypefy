import { Verify2StepCard } from "@/components/auth/Verify2StepCard";

export default async function Verify2StepPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; reason?: string }>;
}) {
  const { email, reason } = await searchParams;
  return (
    <Verify2StepCard
      email={email ?? ""}
      reason={reason === "otp" ? "otp" : "two-step"}
    />
  );
}
