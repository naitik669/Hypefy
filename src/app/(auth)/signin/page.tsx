import { AccountGate } from "@/components/auth/AccountGate";

export default function SignInPage() {
  return <AccountGate mode="signin" />;
}
