"use client";
import { Button } from "@/components/ui/Button";
import { ResetIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { changedCount, defaultMergeOptions, type BookmarkMode, type FormMode, type MergeOptions as Options, type TocMode } from "@/lib/pdf/merge-options";
import { mergeCopy } from "./copy";

const tocDescriptions: Record<TocMode, string> = {
  none: "No contents page.",
  names: "Adds a clickable list of files at the front.",
  titles: "Like file names, but uses each PDF's title when it has one.",
};
const bookmarkOptions: { value: BookmarkMode; label: string; description: string }[] = [
  { value: "keep", label: "Keep all", description: "Keeps each file's bookmarks as they are." },
  { value: "remove", label: "Remove all", description: "The merged file has no bookmarks." },
  { value: "perFile", label: "One per file", description: "Adds one bookmark per file, named after it." },
  { value: "perFileNested", label: "One per file, keep existing inside", description: "One bookmark per file, with that file's bookmarks inside it." },
];
const formOptions: { value: FormMode; label: string; description: string }[] = [
  { value: "rename", label: "Merge, rename duplicates", description: "Keeps every field. Repeated names get a number." },
  { value: "merge", label: "Merge", description: "Fields with the same name share one value." },
  { value: "flatten", label: "Flatten", description: "Turns fields into plain page content." },
  { value: "remove", label: "Remove", description: "Removes all form fields." },
];

/** ChoiceTile icon (30px, duotone): a page with no list, a list of names, or a list of titles. */
function TocIcon({ kind }: { kind: TocMode }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="max-lg:hidden" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.5" y="3.5" width="17" height="23" rx="2" fill="currentColor" fillOpacity={0.15} />
      {kind === "names" && <path d="M10.5 10h9M10.5 15h9M10.5 20h6" />}
      {kind === "titles" && <path d="M10.5 9.5h9M10.5 14h6M10.5 18h9M10.5 22h6" strokeWidth="1.5" />}
    </svg>
  );
}

/** One option group: the title as a BerryPDF step (a soft berry disc with its number). */
function Group({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-sand max-lg:border-b-[1.5px] max-lg:pb-4 max-lg:last:border-b-0">
      <h3 className="mp-step text-[17px]">
        <span className="mp-step__n size-[26px] text-[14px]" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A switch whose explanation is its tooltip and screen-reader description (owner override: minimal text). */
function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div title={description}>
      <Switch id={id} label={label} checked={checked} onChange={onChange} describedBy={`${id}-desc`} className="w-full justify-between text-[15px]" />
      <p id={`${id}-desc`} className="sr-only">
        {description}
      </p>
    </div>
  );
}

/** The options panel (spec F3 M-5); the same component in the dock column and in the sheet. */
export function MergeOptions({ value, onChange, announce }: { value: Options; onChange: (next: Options) => void; announce: (m: string) => void }) {
  const set = <K extends keyof Options>(key: K, v: Options[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-4 lg:gap-6" data-testid="merge-options">
      <Group n={1} title="Contents page">
        <div title={tocDescriptions[value.toc]}>
          <SegmentedControl<TocMode>
            label="Contents page"
            look="tiles"
            fullWidth
            value={value.toc}
            onChange={(v) => set("toc", v)}
            options={[
              { value: "none", label: "None", icon: <TocIcon kind="none" /> },
              { value: "names", label: "File names", shortLabel: "Names", icon: <TocIcon kind="names" /> },
              { value: "titles", label: "Document titles", shortLabel: "Titles", icon: <TocIcon kind="titles" /> },
            ]}
          />
          <p className="sr-only">
            {tocDescriptions[value.toc]}
          </p>
        </div>
        <SwitchRow
          id="merge-cover"
          label="First file is a cover"
          checked={value.cover}
          onChange={(v) => set("cover", v)}
          description={value.toc === "none" ? "Only used with a contents page." : "Puts the contents page after the first file and leaves the cover out of the list."}
        />
      </Group>
      <Group n={2} title="Bookmarks">
        <Select<BookmarkMode>
          id="merge-bookmarks"
          label="Bookmarks"
          hideLabel
          value={value.bookmarks}
          options={bookmarkOptions}
          description={bookmarkOptions.find((o) => o.value === value.bookmarks)!.description}
          onChange={(v) => set("bookmarks", v)}
        />
      </Group>
      <Group n={3} title="Page layout">
        <SwitchRow id="merge-footer" label="Add file name to the footer" checked={value.footer} onChange={(v) => set("footer", v)} description="Writes the file's name small at the bottom of each of its pages." />
        <SwitchRow id="merge-same-width" label="Make all pages the same width" checked={value.sameWidth} onChange={(v) => set("sameWidth", v)} description="Scales pages to the width of the first page. Nothing is cropped." />
        <SwitchRow
          id="merge-double-sided"
          label="Pad for double-sided printing"
          checked={value.doubleSided}
          onChange={(v) => set("doubleSided", v)}
          description="Adds a blank page after each file with an odd page count, so every file starts on a front side."
        />
      </Group>
      <Group n={4} title="Form fields">
        <Select<FormMode>
          id="merge-forms"
          label="Form fields"
          hideLabel
          value={value.forms}
          options={formOptions}
          description={formOptions.find((o) => o.value === value.forms)!.description}
          onChange={(v) => set("forms", v)}
        />
      </Group>
      <Button
        variant="soft"
        className="self-start"
        iconStart={<ResetIcon size={18} />}
        disabled={changedCount(value) === 0}
        onClick={() => {
          onChange(defaultMergeOptions);
          announce(mergeCopy.resetDone);
        }}
      >
        {mergeCopy.reset}
      </Button>
    </div>
  );
}
