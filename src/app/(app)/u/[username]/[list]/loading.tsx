import { PeopleListSkeleton } from "@/components/skeletons/Skeletons";

// Followers and Following share this route, and a loading file is not told
// which one it is for, so the title is left for the page to bring.
export default function Loading() {
  return <PeopleListSkeleton title="" />;
}
