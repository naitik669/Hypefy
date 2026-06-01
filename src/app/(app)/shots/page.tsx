import { ShotsViewer } from "@/components/shots/ShotsViewer";
import { shotsFeed } from "@/lib/mock-shots";

export default function ShotsPage() {
  return <ShotsViewer shots={shotsFeed} />;
}
