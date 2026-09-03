import type { Metadata } from "next";
import { ResetPasswordCard } from "@/components/auth/ResetPasswordCard";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordCard />;
}
