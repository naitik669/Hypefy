import { notFound } from "next/navigation";
import { ChatView } from "@/components/messages/ChatView";
import { getThread, getThreadMessages } from "@/lib/mock-messages";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const thread = getThread(threadId);

  if (!thread) {
    notFound();
  }

  const messages = getThreadMessages(threadId);
  return <ChatView thread={thread} messages={messages} />;
}
