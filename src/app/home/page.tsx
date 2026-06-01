import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { HypefyMark } from "@/components/HypefyMark";

// Placeholder home — confirms auth works. The real feed comes next.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <HypefyMark className="h-12 w-12 text-accent" />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">You&apos;re in.</h1>
        <p className="mt-2 text-sm text-muted">
          Signed in as{" "}
          <span className="text-foreground">{user.email}</span>
        </p>
      </div>
      <SignOutButton />
    </main>
  );
}
