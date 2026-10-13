import { CopyButton } from "@/components/copy-button";
import { applyTemplate, specificsText, type Specific } from "@/lib/listing-text";
import { money } from "@/lib/format";

/** The reviewed listing as copy buttons, for pasting into the eBay app (until publishing from the app is on). */
export function ListingCopy({
  item,
  template,
}: {
  item: {
    title: string;
    list_price: number | null;
    listing_description: string | null;
    condition_text: string | null;
    item_specifics: Specific[] | null;
    ebay_category_name: string | null;
    sku: string | null;
  };
  template: string | null;
}) {
  const description = applyTemplate(template, {
    title: item.title,
    description: item.listing_description ?? "",
    condition: item.condition_text ?? "",
  });
  const specifics = specificsText(item.item_specifics);
  const rows: [string, string, string][] = [
    ["Title", item.title, `${item.title.length}/80`],
    ["Price", item.list_price === null ? "" : Number(item.list_price).toFixed(2), money(item.list_price)],
    ["Description", description, ""],
    ["Condition", item.condition_text ?? "", ""],
    ["Specifics", specifics, `${item.item_specifics?.length ?? 0} specifics`],
    ["Category", item.ebay_category_name ?? "", ""],
    ["SKU", item.sku ?? "", ""],
  ];
  return (
    <ul className="list text-sm">
      {rows
        .filter(([, text]) => text)
        .map(([label, text, note]) => (
          <li key={label} className="flex items-start gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">
                {label} {note && <span>· {note}</span>}
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap">{text}</div>
            </div>
            <CopyButton text={text} />
          </li>
        ))}
    </ul>
  );
}
