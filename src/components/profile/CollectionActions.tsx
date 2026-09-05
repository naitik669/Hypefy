"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * Delete a collection.
 *
 * The old modal used a native `confirm()` — the one place in the app that did,
 * rather than the shared ConfirmDialog — and discarded the result of the
 * delete, so a refusal looked like nothing happening.
 */
export function CollectionActions({
  collectionId,
  name,
}: {
  collectionId: string;
  name: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const showToast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    // .select() so an RLS refusal — zero rows, no error — is not read as
    // success and does not send you back to a page that still has the folder.
    const { data, error } = await supabase
      .from("collections")
      .delete()
      .eq("id", collectionId)
      .select("id");
    setBusy(false);
    setConfirm(false);
    if (error || !data || data.length === 0) {
      showToast(error?.message ?? "Couldn't delete that collection.");
      return;
    }
    showToast("Collection deleted");
    router.replace("/saved");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        disabled={busy}
        aria-label="Delete collection"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-danger disabled:opacity-60"
      >
        <Trash2 size={18} />
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        icon={Trash2}
        title={`Delete "${name}"`}
        body="The collection goes, but the posts inside stay saved."
        confirmLabel="Delete"
      />
    </>
  );
}
