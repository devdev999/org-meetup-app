import { OccurrenceEdit } from "../../../meetups/occurrence-edit";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  return <OccurrenceEdit id={(await params).id} kind="event" />;
}
