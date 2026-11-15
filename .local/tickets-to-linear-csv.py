#!/usr/bin/env python3
"""Convert NUHire TICKETS.md into a Linear-importable CSV.

Usage:  python3 .local/tickets-to-linear-csv.py [out.csv]
Import: Linear -> Settings -> Import/Export -> CSV.

Labels come out as "<section>,<horizon>,<level>[,flags]" so you can filter a
board by either axis. The ticket code leads the title (SEC-3: ...) so the
cross-references inside descriptions still resolve after import.
"""
import csv
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "TICKETS.md"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / ".local/nuhire-linear-import.csv"

text = SRC.read_text()

# Everything before the first section heading is preamble: the org table, the
# "recently closed" list, and the week-1 summary table, all of which either
# duplicate or contradict the canonical ticket bodies below.
start = re.search(r"^# INFRA$", text, re.M)
if not start:
    sys.exit("could not find the '# INFRA' section heading; the file layout changed")
body = text[start.start() :]
body = re.split(r"^# Sequencing$", body, maxsplit=1, flags=re.M)[0]

# Section and horizon are positional: whichever heading most recently preceded
# the ticket. ONB tickets live above # INFRA and are handled as a default.
SECTION_RE = re.compile(r"^# (INFRA|BACKEND|FRONTEND|PRODUCT)$", re.M)
HORIZON_RE = re.compile(r"^## (Short|Medium|Long) term$", re.M)

SECTION_LABEL = {
    "INFRA": "infra",
    "BACKEND": "backend",
    "FRONTEND": "frontend",
    "PRODUCT": "product",
}
HORIZON_LABEL = {"Short": "short-term", "Medium": "medium-term", "Long": "long-term"}

# **CODE-N [FLAG] [FLAG] 14h — Title**, optionally as a nested bullet, with an
# optional trailing "— deps: ..." or "— partially done".
HEADER = re.compile(
    r"\*\*(?P<code>(?:ONB|INFRA|SEC|API|TCH|STU|UI)-\d+[a-z]?)\s+"
    r"(?P<flags>(?:\[[A-Z]+\]\s*)*)"
    r"(?P<est>(?:\d+(?:[–-]\d+)?h|EPIC))?\s*"
    r"—\s*(?P<title>[^*]+?)\s*\*\*"
    # Stop at a "*" so a second ticket sharing the line isn't swallowed.
    r"(?P<trailer>[^\n*]*)"
)

matches = list(HEADER.finditer(body))
if not matches:
    sys.exit("no tickets matched; the header format changed")


def preceding(pattern, pos, default):
    """The last heading of this kind before `pos`."""
    found = default
    for m in pattern.finditer(body, 0, pos):
        found = m.group(1)
    return found


# Cannot slip, per the Sequencing section.
URGENT = {"SEC-14", "INFRA-4", "API-4"}
# Lead tickets that gate everyone, plus the week-1 six and the MVP cut.
HIGH = {
    "INFRA-1", "INFRA-2", "INFRA-3",
    "ONB-1", "UI-9", "STU-3", "STU-6", "TCH-1", "INFRA-5",
    "API-3", "API-5", "API-7", "API-11", "INFRA-10",
    "SEC-7", "STU-7", "STU-27",
}

LEVEL_LABEL = {"GFI": "good first issue", "MED": "medium", "HARD": "hard"}
FLAG_LABEL = {"SPEC": "needs-spec", "LEAD": "lead-only", "SEC": "security"}

rows = []
for i, m in enumerate(matches):
    code = m.group("code")
    title = m.group("title").strip()
    trailer = m.group("trailer").strip()
    est_raw = (m.group("est") or "").strip()
    flags = re.findall(r"\[([A-Z]+)\]", m.group("flags"))

    section = preceding(SECTION_RE, m.start(), "INFRA")
    horizon = preceding(HORIZON_RE, m.start(), "Short")

    # Body runs to the next ticket header, or to the next heading/rule.
    nxt = matches[i + 1].start() if i + 1 < len(matches) else len(body)
    chunk = body[m.end() : nxt]
    chunk = re.split(r"\n---\n|\n#{1,2} ", chunk)[0].strip()
    # A trailing "·" from the two-on-one-line entries (SEC-16 · SEC-17).
    chunk = chunk.rstrip("·").strip()

    # Linear estimate points from the hour figure. Top of a range wins.
    points = ""
    hours = ""
    if est_raw and est_raw != "EPIC":
        hours = est_raw
        h = max(int(n) for n in re.findall(r"\d+", est_raw))
        for threshold, pts in ((3, 1), (6, 2), (10, 3), (16, 5), (24, 8)):
            if h <= threshold:
                points = pts
                break
        else:
            points = 13

    labels = [SECTION_LABEL[section], HORIZON_LABEL[horizon]]
    for f in flags:
        if f in LEVEL_LABEL:
            labels.append(LEVEL_LABEL[f])
        elif f in FLAG_LABEL:
            labels.append(FLAG_LABEL[f])
    if est_raw == "EPIC":
        labels.append("epic")
    low = trailer.lower()
    if "needs a decision" in low:
        labels.append("needs-decision")
    if "partially done" in low or "partial" in low:
        labels.append("partially-done")

    meta = []
    if hours:
        meta.append(f"**Estimate:** {hours}")
    if trailer:
        meta.append(f"**Notes:** {trailer.lstrip('—· ').strip()}")

    parts = []
    if meta:
        parts.append("  \n".join(meta))
    if chunk:
        parts.append(chunk)
    parts.append(
        f"_Imported from `TICKETS.md` ({code}). Line numbers in citations may have "
        "drifted; trust file and symbol names over them._"
    )

    priority = "Urgent" if code in URGENT else "High" if code in HIGH else "Medium"

    rows.append({
        "Title": f"{code}: {title}",
        "Description": "\n\n".join(parts),
        "Status": "Backlog",
        "Priority": priority,
        "Estimate": points,
        "Labels": ",".join(labels),
    })

seen = {}
for r in rows:
    key = r["Title"].split(":", 1)[0]
    seen[key] = seen.get(key, 0) + 1
dupes = [k for k, v in seen.items() if v > 1]
if dupes:
    print(f"warning: duplicate codes {dupes}", file=sys.stderr)

with OUT.open("w", newline="") as fh:
    writer = csv.DictWriter(
        fh, fieldnames=["Title", "Description", "Status", "Priority", "Estimate", "Labels"]
    )
    writer.writeheader()
    writer.writerows(rows)

print(f"{len(rows)} tickets -> {OUT}")
for axis in (0, 1):
    counts = {}
    for r in rows:
        k = r["Labels"].split(",")[axis]
        counts[k] = counts.get(k, 0) + 1
    for k, v in sorted(counts.items()):
        print(f"  {k:15} {v}")
    print()
for p in ("Urgent", "High", "Medium"):
    print(f"  {p:8} {sum(1 for r in rows if r['Priority'] == p)}")
