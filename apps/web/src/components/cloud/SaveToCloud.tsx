"use client";
import "./cloud.css";
import { useEffect, useRef, useState } from "react";
import { openCloudWindow, type CloudSession } from "@/lib/cloud/client";
import { newRequestId } from "@/lib/cloud/protocol";
import { configuredProviders, routeFor, SAVE_PROVIDERS, type CloudProvider } from "@/lib/cloud/providers";
import type { FlowNoticeInput } from "../tool-flow/types";
import { buttonClasses } from "../ui/Button";
import { MenuButton, type MenuButtonHandle } from "./CloudMenu";
import { CheckIcon, ChevronDownIcon } from "../ui/icons";
import { cloudCopy } from "./copy";
import { transferCopy } from "./transfer-copy";
import { ProviderMark } from "./ProviderMark";
import { cloudFootnote, providerItems } from "./items";
import { cloudAction } from "./NoticeAction";

/**
 * Result screen "Save to Drive" (spec U-2 E5, AC-160 to AC-164, AC-169): a `line` split next to
 * Download. The result goes from this browser into the provider's own window (over the request's
 * channel, only after that window says it is ready), which uploads it straight to the provider.
 * Our server never sees it; the result's privacy line changes after a save (onSaved).
 */
export type SaveToCloudProps = {
  file: File;
  preferred: CloudProvider | null;
  toolName: string;
  pushNotice: (n: Omit<FlowNoticeInput, "id">) => string;
  announce: (m: string) => void;
  /** After a save: the result's new privacy line. */
  onSaved: (privacyLine: string) => void;
};

/** Providers the result can save to in this build. */
const providers = SAVE_PROVIDERS.filter((p) => configuredProviders().includes(p));

export function SaveToCloud({ file, preferred, toolName, pushNotice, announce, onSaved }: SaveToCloudProps) {
  const [busy, setBusy] = useState<{ p: CloudProvider; pct: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const session = useRef<CloudSession | null>(null);
  const menu = useRef<MenuButtonHandle>(null);
  useEffect(() => () => session.current?.cancel(), []);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);
  if (!providers.length) return null;
  const main = preferred && providers.includes(preferred) ? preferred : providers.length === 1 ? providers[0] : null;

  function save(p: CloudProvider) {
    if (busy) return;
    const fail = () =>
      pushNotice({ tone: "danger", title: transferCopy.saveFailed(p), body: transferCopy.saveFailedBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: () => save(p) }) });
    if (navigator.onLine === false) {
      pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(p) });
      return;
    }
    let done = false;
    const s = openCloudWindow(
      routeFor(p),
      { req: newRequestId(), accept: [`.${file.name.split(".").pop()?.toLowerCase() || "pdf"}`], multiple: false, max: Math.max(1, file.size), tool: toolName, provider: p, mode: "save" },
      {
        onSaveProgress: (loaded, total) => setBusy({ p, pct: total ? Math.round((loaded / total) * 100) : 0 }),
        onSaved: (name, link) => {
          done = true;
          setBusy(null);
          setSaved(true);
          onSaved(transferCopy.resultPrivacySaved(p));
          announce(transferCopy.savedAlert(p, name));
          pushNotice({ tone: "success", title: transferCopy.savedAlert(p, name), action: link ? cloudAction({ label: transferCopy.openIn(p), href: link }) : undefined, timeoutMs: 8000 });
        },
        onError: () => {
          done = true;
          setBusy(null);
          fail();
        },
        onDone: () => setBusy(null),
        onClosed: () => {
          setBusy(null);
          if (!done) fail();
        },
      },
    );
    if (!s) {
      pushNotice({ tone: "warning", title: transferCopy.blocked(p), body: transferCopy.blockedBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: () => save(p), autoFocus: true }) });
      return;
    }
    session.current = s;
    setBusy({ p, pct: 0 });
    s.sendSave(file);
  }

  const idle = main ? transferCopy.saveTo(main) : transferCopy.saveToAny;
  const label = busy ? transferCopy.saving(busy.pct) : saved ? transferCopy.saved : idle;
  // Every label it can show, stacked invisibly in one grid cell: the button never changes width (AC-169).
  const text = (
    <span className="ip-save__label tabular-nums">
      {[idle, transferCopy.saving(100), transferCopy.saved].map((t) => (
        <span key={t} className="ip-save__ghost" aria-hidden="true">
          {t}
        </span>
      ))}
      <span>{label}</span>
    </span>
  );
  const items = providerItems(providers, save, "save");
  return (
    <span className="ip-split ip-save inline-flex max-sm:w-full" data-testid="save-to-cloud">
      {main ? (
        <button type="button" className={buttonClasses("line", "md")} aria-busy={busy ? true : undefined} disabled={!!busy} onClick={() => save(main)} data-testid="save-main">
          {saved ? <CheckIcon size={18} /> : <ProviderMark provider={main} size={18} />}
          {text}
        </button>
      ) : (
        <MenuButton
          ref={menu}
          label={label}
          presentation="auto"
          popupClassName="ip-menu-wide"
          className={buttonClasses("line", "md")}
          disabled={!!busy}
          items={items}
          footnote={cloudFootnote(transferCopy.saveFootnote)}
          data-testid="save-main"
        >
          {text}
          <ChevronDownIcon size={16} />
        </MenuButton>
      )}
      {main && providers.length > 1 && (
        <MenuButton
          label={transferCopy.saveAnother}
          title={transferCopy.saveAnother}
          placement="bottom-end"
          presentation="auto"
          popupClassName="ip-menu-wide"
          className={buttonClasses("line", "md", "ip-split__caret")}
          disabled={!!busy}
          items={items}
          footnote={cloudFootnote(transferCopy.saveFootnote)}
          data-testid="save-caret"
        >
          <ChevronDownIcon size={16} />
        </MenuButton>
      )}
    </span>
  );
}

