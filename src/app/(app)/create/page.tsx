"use client";

import { useRouter } from "next/navigation";
import { Image as ImageIcon, Video, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateActionCard } from "@/components/create/CreateActionCard";

const actions = [
  {
    key: "post",
    icon: ImageIcon,
    title: "Create Post",
    text: "Share a photo, caption, and your thoughts.",
    from: 265,
    to: 320,
    href: "/create/post",
  },
  {
    key: "shot",
    icon: Video,
    title: "Add Shot",
    text: "A short video reel for the Shots feed.",
    from: 150,
    to: 190,
    href: "/create/shot",
  },
  {
    key: "show",
    icon: Clock,
    title: "Add Show",
    text: "A moment that disappears in 24 hours.",
    from: 30,
    to: 350,
    href: "/shows/add",
  },
] as const;

export default function CreatePage() {
  const router = useRouter();

  return (
    <>
      <PageHeader title="Create" showBack />
      <div className="px-4 pt-2">
        <p className="pb-4 text-sm text-muted">What do you want to put into the world?</p>
        <div className="flex flex-col gap-3">
          {actions.map(({ key, href, ...rest }) => (
            <CreateActionCard key={key} {...rest} onClick={() => router.push(href)} />
          ))}
        </div>
      </div>
    </>
  );
}
