"use client";
import "./cloud.css";
import { useEffect, useState } from "react";
import { readLast } from "@/lib/cloud/last-used";
import { providerName, type CloudProvider } from "@/lib/cloud/providers";
import { cloudCopy } from "./copy";
import { ProviderMark } from "./ProviderMark";

/**
 * One-tap provider buttons under the upload button (spec U-2 E1, AC-165). Server-rendered at its
 * final 44 px height, in the fixed order; the pre-paint script's html[data-cloud-last] moves the
 * last used provider first and shows its name (cloud.css), so nothing shifts after hydration.
 * The `title` (a tooltip, no layout) is set after mount.
 */
export function CloudRow({ providers, onOpen }: { providers: readonly CloudProvider[]; onOpen: (p: CloudProvider, trigger: HTMLElement) => void }) {
  const [last, setLast] = useState<CloudProvider | null>(null);
  useEffect(() => setLast(readLast(providers)), [providers]);
  if (!providers.length) return null;
  return (
    <div role="group" aria-label={cloudCopy.rowLabel} className="ip-cloud-row" data-testid="cloud-row">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          className="ip-cloud-glyph"
          data-p={p}
          title={last === p ? cloudCopy.lastUsedTitle : providerName[p]}
          onClick={(e) => onOpen(p, e.currentTarget)}
        >
          <ProviderMark provider={p} size={22} />
          <span className="ip-cloud-name">
            <span className="sr-only">Choose from </span>
            {providerName[p]}
          </span>
          <span className="ip-cloud-last">{cloudCopy.lastUsed}</span>
        </button>
      ))}
    </div>
  );
}
