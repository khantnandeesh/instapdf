"use client";
import { useEffect, useRef, useState } from "react";
import { openCloudWindow, type CloudSession } from "@/lib/cloud/client";
import { newRequestId } from "@/lib/cloud/protocol";
import { configuredProviders, providerName, routeFor, SAVE_PROVIDERS, type CloudProvider } from "@/lib/cloud/providers";
import { buttonClasses } from "../ui/Button";
import { MenuButton, type MenuButtonHandle } from "./CloudMenu";
import { CheckIcon, ChevronDownIcon, UploadIcon } from "../ui/icons";
import { cloudCopy } from "./copy";
import { transferCopy } from "./transfer-copy";
import { ProviderMark } from "./ProviderMark";
import { cloudFootnote, providerItems } from "./items";
import { cloudAction } from "./NoticeAction";
import { cloudOrigin } from "./intake-engine";
import { pageHub, type CloudDeps } from "./tool-cloud";

/**
 * Result screen "Save to Drive" (spec U-2 E5, AC-160 to AC-164, AC-169; F25 eval G-3): a 48 px `line`
 * icon button next to Download, which keeps the primary's box. The result goes from this browser into the provider's own window (over the request's
 * channel, only after that window says it is ready), which uploads it straight to the provider.
 * Our server never sees it; the result's privacy line changes after a save (onSaved).
 */
export type SaveToCloudProps = {
  file: File;
  toolName: string;
  announce: (m: string) => void;
  /** The result's privacy line when a cloud is involved: the files came from one (AC-131), or a copy went to one. */
  onSaved: (privacyLine: string) => void;
};

/** The result's privacy line when the files came from a cloud (AC-131), or null. ResultCard reads it as it first draws. */
export function originPrivacyLine(): string | null {
  const o = cloudOrigin();
  return o ? transferCopy.resultPrivacy(o) : null;
}

/** Providers the result can save to in this build. */
const providers = SAVE_PROVIDERS.filter((p) => configuredProviders().includes(p));

export function SaveToCloud({ file, toolName, announce, onSaved }: SaveToCloudProps) {
  const [busy, setBusy] = useState<{ p: CloudProvider; pct: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const session = useRef<CloudSession | null>(null);
  const menu = useRef<MenuButtonHandle>(null);
  // The provider the files came from, if any (checked once: the result's inputs are fixed).
  const [preferred] = useState(cloudOrigin);
  useEffect(() => () => session.current?.cancel(), []);
  // The tool page's notices (its hub lives in the page's own code, so they never depend on what else loaded).
  const pushNotice: CloudDeps["pushNotice"] = (n) => pageHub()?.deps?.pushNotice(n) ?? "";
  const dismissNotice = (id: string) => pageHub()?.deps?.dismissNotice(id);
  const stopped = useRef<string | null>(null);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);
  if (!providers.length) return null;
  const main = preferred && providers.includes(preferred) ? preferred : providers.length === 1 ? providers[0] : null;

  function save(p: CloudProvider) {
    if (busy) return;
    // A save still listening after "Stopped waiting" is replaced (it never tells this tab anything more).
    session.current?.cancel();
    if (stopped.current) dismissNotice(stopped.current);
    stopped.current = null;
    const fail = () =>
      pushNotice({ tone: "danger", title: transferCopy.saveFailed(p), body: transferCopy.saveFailedBody, action: cloudAction({ label: transferCopy.tryAgain, onClick: () => save(p) }) });
    if (navigator.onLine === false) {
      pushNotice({ tone: "info", title: cloudCopy.offline, body: cloudCopy.offlineBody(providerName[p]) });
      return;
    }
    let done = false;
    let gaveUp = false;
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
          // After "Stopped waiting", the end of the sign-in allowance says nothing new.
          if (!done && !gaveUp) fail();
        },
        // The window seems closed on its sign-in page: say so, free the button, keep listening.
        onGaveUp: () => {
          gaveUp = true;
          setBusy(null);
          const id = pushNotice({
            tone: "info",
            title: transferCopy.stoppedWaiting(p),
            body: transferCopy.stoppedWaitingBody,
            sticky: true,
            action: cloudAction({ label: transferCopy.tryAgain, onClick: () => save(p) }),
          });
          stopped.current = id;
        },
        // It came back after all.
        onResumed: () => {
          gaveUp = false;
          if (stopped.current) dismissNotice(stopped.current);
          stopped.current = null;
          setBusy({ p, pct: 0 });
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
  // A 48 px `line` icon button beside Download (eval G-3: Download keeps the primary's box). Its name is
  // the label it would show ("Save to Drive", "Saving… 40%", "Saved"), and the tooltip says the same.
  const face = busy ? (
    <span className="text-[13px] leading-none font-semibold tabular-nums" aria-hidden="true">
      {busy.pct}%
    </span>
  ) : saved ? (
    <CheckIcon size={20} />
  ) : main ? (
    <ProviderMark provider={main} size={22} />
  ) : (
    <UploadIcon size={22} />
  );
  const cls = buttonClasses("line", "md", "ip-save__icon");
  const others = main ? providers.filter((p) => p !== main) : [];
  return (
    <span className={main && others.length ? "ip-save ip-split inline-flex" : "ip-save inline-flex"} data-testid="save-to-cloud">
      {/* After a pick from a cloud (or with one cloud set up), one press saves there (AC-169); a narrow caret
          beside it offers the other clouds (eval G-3: the icon keeps 48 px). Otherwise the icon opens the menu. */}
      {main ? (
        <button type="button" className={cls} aria-label={label} title={label} aria-busy={busy ? true : undefined} disabled={!!busy} onClick={() => save(main)} data-testid="save-cloud">
          {face}
        </button>
      ) : (
        <MenuButton
          ref={menu}
          label={label}
          title={label}
          placement="bottom-end"
          presentation="auto"
          popupClassName="ip-menu-wide"
          className={cls}
          disabled={!!busy}
          items={providerItems(providers, save, "save")}
          footnote={cloudFootnote(transferCopy.saveFootnote)}
          data-testid="save-cloud"
        >
          {face}
        </MenuButton>
      )}
      {main && others.length > 0 && (
        <MenuButton
          label={transferCopy.saveAnother}
          title={transferCopy.saveAnother}
          placement="bottom-end"
          presentation="auto"
          popupClassName="ip-menu-wide"
          className={buttonClasses("line", "md", "ip-split__caret ip-save__caret")}
          disabled={!!busy}
          items={providerItems(others, save, "save")}
          footnote={cloudFootnote(transferCopy.saveFootnote)}
          data-testid="save-caret"
        >
          <ChevronDownIcon size={16} />
        </MenuButton>
      )}
    </span>
  );
}

