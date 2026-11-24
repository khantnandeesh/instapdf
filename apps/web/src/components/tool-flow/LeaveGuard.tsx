"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { siteCopy } from "../site/copy";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useLeaveGuard } from "./useLeaveGuard";

/**
 * Same-origin link click that would leave this page (another path), or null.
 * Modified clicks (new tab or window), downloads and other targets are let through.
 */
export function leavingHref(e: Pick<MouseEvent, "target" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">, here: URL): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return null;
  if (a.target && a.target !== "_self") return null;
  const url = new URL(a.href, here);
  if (url.origin !== here.origin || url.pathname === here.pathname) return null;
  return url;
}

/**
 * While `active` (the tool holds the user's files), asks before leaving:
 * the browser's own prompt on reload/close (beforeunload), and a "Leave this
 * tool?" dialog for in-app link clicks, which client-side navigation would
 * otherwise do silently (spec F2 H-11 item 1). The click listener runs in the
 * capture phase so it fires before next/link and the tool menu.
 */
export function LeaveGuard({ active }: { active: boolean }) {
  useLeaveGuard(active);
  const router = useRouter();
  const [pending, setPending] = useState<URL | null>(null);
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      const url = leavingHref(e, new URL(window.location.href));
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  const leave = () => {
    const url = pending;
    setPending(null);
    if (url) router.push(url.pathname + url.search + url.hash);
  };

  return (
    <Dialog
      open={!!pending}
      onClose={() => setPending(null)}
      title={siteCopy.leaveTitle}
      description={siteCopy.leaveBody}
      initialFocusRef={stay}
      fallbackFocus={() => document.getElementById("main")}
      footer={
        <>
          <Button ref={stay} variant="ghost" onClick={() => setPending(null)}>
            {siteCopy.leaveStay}
          </Button>
          <Button variant="primary" onClick={leave}>
            {siteCopy.leaveGo}
          </Button>
        </>
      }
    />
  );
}
