#!/usr/bin/env python3
"""Validate design links and requirement -> milestone -> ADR traceability.

Uses the Python standard library only. This is not an SDK/runtime test.
"""
from pathlib import Path
import json
import re
import sys


def main(root: Path) -> None:
    docs = root / "docs"
    files = [*sorted(root.glob("*.md")), *sorted(docs.rglob("*.md")), *sorted((root / ".github").rglob("*.md"))]
    link_count = 0
    for path in files:
        text = path.read_text(encoding="utf-8")
        assert text.endswith("\n"), f"Missing newline: {path}"
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if re.match(r"[a-z]+://", target) or target.startswith("#"):
                continue
            target = target.split("#", 1)[0]
            assert (path.parent / target).is_file(), f"Broken link in {path}: {target}"
            link_count += 1
    print(f"PASS: {len(files)} Markdown files; {link_count} relative file links")

    requirements = {}
    for line in (docs / "requirements.md").read_text().splitlines():
        if re.match(r"\| [RZ]\d{2} \|", line):
            row = [cell.strip() for cell in line.split("|")[1:-1]]
            rid, priority, milestone, acceptance, adr = row
            assert rid not in requirements, f"Duplicate requirement: {rid}"
            assert len(acceptance) > 20, f"Missing acceptance: {rid}"
            allowed = {"P0": {"M1", "M2", "M3", "M4"}, "P1": {"M5", "M6"}, "P2": {"M7"}}
            assert milestone in allowed[priority], f"Priority/milestone mismatch: {rid}"
            requirements[rid] = (priority, milestone, adr)
    assert len(requirements) == 36, "Expected R01-R24 and Z01-Z12"
    assert set(requirements) == ({f"R{i:02}" for i in range(1, 25)} | {f"Z{i:02}" for i in range(1, 13)})

    assigned = {}
    for line in (docs / "roadmap.md").read_text().splitlines():
        if re.match(r"\| M[1-7] \|", line):
            row = [cell.strip() for cell in line.split("|")[1:-1]]
            for rid in re.findall(r"\b[RZ]\d{2}\b", row[2]):
                assert rid not in assigned, f"Duplicate roadmap assignment: {rid}"
                assigned[rid] = row[0]
    assert set(assigned) == set(requirements), "Missing/unknown roadmap requirements"
    for rid, (_, milestone, _) in requirements.items():
        assert assigned[rid] == milestone, f"Roadmap mismatch: {rid}"
    print("PASS: 36 unique requirements; priority and milestone assignments agree")

    adrs = {}
    for path in sorted((docs / "decisions").glob("*.md")):
        text = path.read_text()
        match = re.match(r"# (ADR-\d{3})", text)
        assert match, f"Missing ADR ID: {path}"
        aid = match[1]
        assert aid not in adrs, f"Duplicate ADR: {aid}"
        assert path.name.startswith(aid[-3:]), f"ADR filename mismatch: {aid}"
        for heading in ["## 결정", "## 이유와 대안", "## 결과와 제약", "## 검증과 재검토", "## 근거"]:
            assert heading in text, f"Missing {heading}: {aid}"
        adrs[aid] = set(re.findall(r"\b[RZ]\d{2}\b", text))
        assert adrs[aid] <= requirements.keys(), f"Unknown ADR requirement: {aid}"
    assert len(adrs) == 9, "Expected 9 ADRs"
    for rid, (_, _, aid) in requirements.items():
        assert aid in adrs and rid in adrs[aid], f"Missing reverse ADR mapping: {rid} -> {aid}"
    print("PASS: 9 ADRs; every requirement has a matching ADR reference")

    versions = json.loads((docs / "research/dependency-snapshot.json").read_text())
    names = set()
    for package in versions["packages"]:
        assert package["name"] not in names
        names.add(package["name"])
        assert re.fullmatch(r"\d+\.\d+\.\d+", package["version"])
        assert package["source"].startswith("https://registry.npmjs.org/")
    assert "unverified" in versions["status"]
    ux = json.loads((docs / "research/ux-observations.json").read_text())
    assert "not Korea Map Kit QA" in ux["scope"]
    assert len(ux["observations"]) == 2
    assert all(not image["committed"] for image in ux["screenshots"])
    print(f"PASS: {len(names)} exact registry observations; UX evidence scope is explicit")


if __name__ == "__main__":
    try:
        main(Path(__file__).resolve().parents[1])
    except (AssertionError, KeyError, ValueError, OSError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
