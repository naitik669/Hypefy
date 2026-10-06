import { PeopleListSkeleton } from "@/components/skeletons/Skeletons";

export default function Loading() {
  return <PeopleListSkeleton title="Follow requests" rows={5} />;
}
