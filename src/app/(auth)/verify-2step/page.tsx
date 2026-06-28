import { Verify2StepCard } from "@/components/auth/Verify2StepCard";

export default async function Verify2StepPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return <Verify2StepCard email={email ?? ""} />;
}
