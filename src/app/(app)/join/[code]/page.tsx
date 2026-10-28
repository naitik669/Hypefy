import type { Metadata } from "next";
import { JoinByInvite } from "@/components/messages/JoinByInvite";

/**
 * Where an invite link lands.
 *
 * Deliberately says nothing about the group. The code is the only thing
 * the holder has, and whoever opens this may be a stranger who should not
 * learn the name, the picture or the size of a private conversation
 * before anybody has let them in. The server is told nothing here either:
 * the lookup happens in join_by_invite, which is the one place allowed to
 * read an invite by its code.
 */
export const metadata: Metadata = {
  title: "Join a chat on Hypefy",
  description: "You have been invited to a group chat.",
  robots: { index: false, follow: false },
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <JoinByInvite code={code} />;
}
