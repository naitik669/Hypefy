"use client";

import { useState } from "react";
import { Image as ImageIcon, Camera, Users, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateActionCard } from "@/components/create/CreateActionCard";

const actions = [
  {
    key: "Post",
    icon: ImageIcon,
    title: "Create Post",
    text: "Share something with your people.",
    from: 265,
    to: 320,
  },
  {
    key: "Shot",
    icon: Camera,
    title: "Add Shot",
    text: "A quick moment that lives for 24 hours.",
    from: 150,
    to: 190,
  },
  {
    key: "Room",
    icon: Users,
    title: "Create Room",
    text: "Start a space for your people.",
    from: 30,
    to: 70,
  },
] as const;

export default function CreatePage() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Create" showBack />

      <div className="px-4 pt-2">
        <p className="pb-4 text-sm text-muted">
          What do you want to put into the world?
        </p>
        <div className="flex flex-col gap-3">
          {actions.map(({ key, ...rest }) => (
            <CreateActionCard
              key={key}
              {...rest}
              onClick={() => setActive(key)}
            />
          ))}
        </div>
      </div>

      {/* Coming-soon sheet */}
      {active && (
        <div
          className="fixed inset-0 z-50 mx-auto flex max-w-[480px] items-end bg-black/60"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-border bg-elevated p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-border" />
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{active} composer</h2>
                <p className="mt-1 text-sm text-muted">
                  Coming soon — this is where you’ll create your {active.toLowerCase()}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5"
              >
                <X size={20} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="mt-6 h-12 w-full rounded-pill bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
