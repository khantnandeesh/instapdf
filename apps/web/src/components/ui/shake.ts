/**
 * Restarts the 4px field shake (motion.md S10: on blur with an invalid value, or on pressing a
 * disabled primary) without remounting anything. Under reduced motion the global rule drops it.
 */
export function shakeElement(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("ip-shake");
  void el.offsetWidth; // restart the animation
  el.classList.add("ip-shake");
  el.addEventListener("animationend", () => el.classList.remove("ip-shake"), { once: true });
}
