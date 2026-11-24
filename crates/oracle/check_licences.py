"""Fails when a crate in the dependency graph has a licence outside the allow-list
(CLAUDE.md rule 3). A crate passes when at least one "OR" choice is made only of allowed terms.

Zlib and Unicode-3.0 are permissive (no copyleft). They are not named in CLAUDE.md, so they are
listed separately here: see the note in crates/README.md.
"""
import json, re, subprocess, sys

ALLOWED = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "ISC", "MPL-2.0", "Unlicense"}
PERMISSIVE_UNLISTED = {"Zlib", "Unicode-3.0"}

meta = json.loads(subprocess.check_output(["cargo", "metadata", "--format-version", "1", "--locked"]))
bad = []
for p in meta["packages"]:
    lic = (p.get("license") or "").replace("/", " OR ")
    choices = [c.strip(" ()") for c in re.split(r"\bOR\b", lic)]
    ok = any(c and all(t.strip(" ()") in ALLOWED | PERMISSIVE_UNLISTED for t in re.split(r"\bAND\b", c)) for c in choices)
    if not ok:
        bad.append(f"{p['name']} {p['version']}: {p.get('license')!r}")
if bad:
    print("Licences outside the allow-list:\n  " + "\n  ".join(bad))
    sys.exit(1)
print(f"{len(meta['packages'])} crates, all licences allowed")
