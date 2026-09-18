/** A text field's value, or null when it was left blank or is not a text field. */
export function formText(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
