import { OccurrenceEdit } from "../../occurrence-edit";

export default async function EditMeetupPage({ params }: { params: Promise<{ id: string }> }) {
  return <OccurrenceEdit id={(await params).id} kind="meetup" />;
}
