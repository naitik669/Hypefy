import Link from "next/link";
import { PenSquare, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { MessageListItem } from "@/components/messages/MessageListItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { threads } from "@/lib/mock-messages";

export default function MessagesPage() {
  return (
    <>
      <PageHeader
        title="Messages"
        right={
          <Link
            href="/search"
            aria-label="New message"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
          >
            <PenSquare size={22} />
          </Link>
        }
      />

      <div className="px-4 py-3">
        <SearchBar placeholder="Search messages" href="/search" />
      </div>

      <FilterPills options={["All", "Rooms", "Unread", "Requests"]} />

      {threads.length > 0 ? (
        <div className="flex flex-col">
          {threads.map((t) => (
            <MessageListItem key={t.id} thread={t} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          text="Start a room, post something, or say hi to someone."
          ctaLabel="Discover people"
          ctaHref="/discover"
        />
      )}
    </>
  );
}
