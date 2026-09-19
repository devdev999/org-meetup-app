export function MeetupTime({ value }: { value: string }) {
  return <time dateTime={value}>{value.slice(0, 16).replace("T", " ")} UTC</time>;
}
