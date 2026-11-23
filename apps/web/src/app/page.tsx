import Link from "next/link";
import { tools, type ToolCategory } from "@/tools/registry";

const groups: { id: ToolCategory; label: string }[] = [
  { id: "organize", label: "Organize pages" },
  { id: "edit", label: "Edit & sign" },
  { id: "optimize", label: "Optimize" },
  { id: "security", label: "Security" },
  { id: "convert-from", label: "Convert from PDF" },
  { id: "convert-to", label: "Convert to PDF" },
  { id: "scans", label: "Scans" },
  { id: "automate", label: "Automate" },
];

// Placeholder catalogue. The real home page is feature F2 (see docs/process/backlog.md).
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">InstaPDF</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">Fast, private PDF tools. Most run right in your browser.</p>
      {groups.map((g) => (
        <section key={g.id} className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">{g.label}</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools
              .filter((t) => t.category === g.id)
              .map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/${t.slug}`}
                    className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">{t.summary}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
