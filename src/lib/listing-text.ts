// Client-safe helpers for turning an item's reviewed listing into text she can paste.

export type Specific = { name: string; value: string };

/** Fills her saved description template. Placeholders: {title} {description} {condition}. */
export function applyTemplate(template: string | null | undefined, v: { title: string; description: string; condition: string }) {
  const t = (template ?? "").trim();
  if (!t) return [v.description, v.condition && `Condition: ${v.condition}`].filter(Boolean).join("\n\n");
  return t
    .replaceAll("{title}", v.title)
    .replaceAll("{description}", v.description)
    .replaceAll("{condition}", v.condition)
    .trim();
}

export function specificsText(specifics: Specific[] | null | undefined) {
  return (specifics ?? []).map((s) => `${s.name}: ${s.value}`).join("\n");
}
