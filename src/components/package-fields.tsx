"use client";

import { useState } from "react";

export type PackageValue = { weightOz: number | null; lengthIn: number | null; widthIn: number | null; heightIn: number | null };

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * Package weight and size the way eBay's listing form asks for them: weight in lb + oz, size in inches.
 * Stored as total ounces. With `names`, it also renders hidden inputs for a plain form post.
 */
export function PackageFields({
  initial,
  onChange,
  names = false,
  required = false,
}: {
  initial: PackageValue;
  onChange?: (v: PackageValue) => void;
  names?: boolean;
  required?: boolean;
}) {
  const startOz = initial.weightOz ?? null;
  const [lb, setLb] = useState(startOz === null ? "" : String(Math.floor(startOz / 16) || ""));
  const [oz, setOz] = useState(startOz === null ? "" : String(Math.round((startOz % 16) * 10) / 10 || ""));
  const [l, setL] = useState(initial.lengthIn === null ? "" : String(initial.lengthIn));
  const [w, setW] = useState(initial.widthIn === null ? "" : String(initial.widthIn));
  const [h, setH] = useState(initial.heightIn === null ? "" : String(initial.heightIn));

  const value = (next: Partial<Record<"lb" | "oz" | "l" | "w" | "h", string>>): PackageValue => {
    const v = { lb, oz, l, w, h, ...next };
    const pounds = num(v.lb) ?? 0;
    const ounces = num(v.oz) ?? 0;
    return {
      weightOz: v.lb.trim() === "" && v.oz.trim() === "" ? null : Math.round((pounds * 16 + ounces) * 100) / 100,
      lengthIn: num(v.l),
      widthIn: num(v.w),
      heightIn: num(v.h),
    };
  };
  const set = (key: "lb" | "oz" | "l" | "w" | "h", setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    onChange?.(value({ [key]: e.target.value }));
  };
  const current = value({});
  const box = "input px-3 text-center";

  return (
    <div className="space-y-2">
      <div>
        <span className="mb-1 block text-sm font-medium">
          Package weight {required && <span className="text-coral">(needed for calculated shipping)</span>}
        </span>
        <div className="flex items-center gap-2">
          <input className={`${box} w-20`} inputMode="numeric" value={lb} onChange={set("lb", setLb)} aria-label="Pounds" />
          <span className="text-sm text-muted">lb</span>
          <input className={`${box} w-20`} inputMode="decimal" value={oz} onChange={set("oz", setOz)} aria-label="Ounces" />
          <span className="text-sm text-muted">oz</span>
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium">Package size (inches)</span>
        <div className="flex items-center gap-2">
          <input className={`${box} w-20`} inputMode="decimal" value={l} onChange={set("l", setL)} aria-label="Length" placeholder="L" />
          <span className="text-muted">×</span>
          <input className={`${box} w-20`} inputMode="decimal" value={w} onChange={set("w", setW)} aria-label="Width" placeholder="W" />
          <span className="text-muted">×</span>
          <input className={`${box} w-20`} inputMode="decimal" value={h} onChange={set("h", setH)} aria-label="Height" placeholder="H" />
        </div>
      </div>
      {names && (
        <>
          <input type="hidden" name="weight_oz" value={current.weightOz ?? ""} />
          <input type="hidden" name="length_in" value={current.lengthIn ?? ""} />
          <input type="hidden" name="width_in" value={current.widthIn ?? ""} />
          <input type="hidden" name="height_in" value={current.heightIn ?? ""} />
        </>
      )}
    </div>
  );
}

export function packageComplete(v: PackageValue) {
  return !!(v.weightOz && v.lengthIn && v.widthIn && v.heightIn);
}
