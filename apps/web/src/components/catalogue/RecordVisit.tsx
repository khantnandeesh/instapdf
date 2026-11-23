"use client";
import { useEffect } from "react";
import { recordVisit } from "@/lib/recent-tools";

/** Records a visit to a usable tool page in the device-only recent list (spec F2 §3f). Renders nothing. */
export function RecordVisit({ slug }: { slug: string }) {
  useEffect(() => {
    recordVisit(slug);
  }, [slug]);
  return null;
}
