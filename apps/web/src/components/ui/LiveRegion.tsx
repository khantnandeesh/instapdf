/** One polite (or assertive) region; changing `message` announces it. */
export function LiveRegion({ message, politeness = "polite" }: { message: string; politeness?: "polite" | "assertive" }) {
  return (
    <div aria-live={politeness} aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
