import { CheckEmailCard } from "@/components/auth/CheckEmailCard";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return <CheckEmailCard email={email ?? ""} />;
}
