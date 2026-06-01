import { notFound } from "next/navigation";
import { ShowsViewer } from "@/components/home/ShowsViewer";
import { shows } from "@/lib/mock";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const startIdx = shows.findIndex((s) => s.id === showId);
  if (startIdx === -1) notFound();

  return <ShowsViewer shows={shows} startIdx={startIdx} />;
}
