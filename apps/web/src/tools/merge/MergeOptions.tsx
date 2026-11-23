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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-border max-lg:border-b max-lg:pb-4 max-lg:last:border-b-0">
      <h3 className="text-sm font-semibold text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <Switch id={id} label={label} checked={checked} onChange={onChange} describedBy={`${id}-desc`} />
      <p id={`${id}-desc`} className="min-h-8 text-xs text-fg-muted">
        {description}
      </p>
    </div>
  );
}

/** The options panel (spec F3 M-5); the same component in the dock column and in the sheet. */
export function MergeOptions({ value, onChange, announce }: { value: Options; onChange: (next: Options) => void; announce: (m: string) => void }) {
  const set = <K extends keyof Options>(key: K, v: Options[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-4 lg:gap-5" data-testid="merge-options">
      <Group title="Contents page">
        <div>
          <SegmentedControl<TocMode>
            label="Contents page"
            fullWidth
            value={value.toc}
            onChange={(v) => set("toc", v)}
            options={[
              { value: "none", label: "None" },
              { value: "names", label: "File names", shortLabel: "Names" },
              { value: "titles", label: "Document titles", shortLabel: "Titles" },
            ]}
          />
          <p className="mt-1 min-h-8 text-xs text-fg-muted">{tocDescriptions[value.toc]}</p>
        </div>
        <SwitchRow
          id="merge-cover"
          label="First file is a cover"
          checked={value.cover}
          onChange={(v) => set("cover", v)}
          description={value.toc === "none" ? "Only used with a contents page." : "Puts the contents page after the first file and leaves the cover out of the list."}
        />
      </Group>
      <Group title="Bookmarks">
        <Select<BookmarkMode>
          id="merge-bookmarks"
          label="Bookmarks"
          value={value.bookmarks}
          options={bookmarkOptions}
          description={bookmarkOptions.find((o) => o.value === value.bookmarks)!.description}
          onChange={(v) => set("bookmarks", v)}
        />
      </Group>
      <Group title="Page layout">
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
      <Group title="Form fields">
        <Select<FormMode>
          id="merge-forms"
          label="Form fields"
          value={value.forms}
          options={formOptions}
          description={formOptions.find((o) => o.value === value.forms)!.description}
          onChange={(v) => set("forms", v)}
        />
      </Group>
      <Button
        variant="ghost"
        size="sm"
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
