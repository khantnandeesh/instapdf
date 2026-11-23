"use client";
import { useId } from "react";
import { IconButton } from "./IconButton";
import { MinusIcon, PlusIcon } from "./icons";

export function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  valueText,
  className,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  valueText?: (v: number) => string;
  className?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <IconButton label={`Smaller ${label.toLowerCase()}`} variant="soft" icon={<MinusIcon size={16} />} onClick={() => onChange(clamp(value - step))} disabled={value <= min} />
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText?.(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ip-range h-11 w-28"
      />
      <IconButton label={`Larger ${label.toLowerCase()}`} variant="soft" icon={<PlusIcon size={16} />} onClick={() => onChange(clamp(value + step))} disabled={value >= max} />
    </div>
  );
}
