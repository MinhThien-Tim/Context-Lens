#!/usr/bin/env python3
"""Build and verify the distributable Context Lens EN-VI dictionary pack."""
from __future__ import annotations
import argparse, hashlib, json, sqlite3
from collections import defaultdict
from pathlib import Path

LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
ATTRIBUTION = ("Context Lens English-Vietnamese pack derived from Skypedia's English-Vietnamese Dictionary Database (2026), based on MinhQND Dictionary with data from Wiktionary and other open linguistic resources. Licensed CC BY-SA 4.0. Full notices are in ATTRIBUTION.md shipped beside this pack.")

def clean(value: str | None, limit: int) -> str:
    return " ".join((value or "").split())[:limit]

def build(source: Path, output_dir: Path, version: str, attribution_file: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
    if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("Source database integrity check failed")
    rows = connection.execute("""
      SELECT w.word, d.pos, d.sub_pos, d.definition, p.ipa
      FROM words w JOIN word_definitions wd ON wd.word_id=w.id
      JOIN definitions d ON d.id=wd.definition_id
      LEFT JOIN pronunciations p ON p.id=(SELECT p2.id FROM pronunciations p2 WHERE p2.word_id=w.id ORDER BY CASE WHEN p2.region IN ('BrE','UK') THEN 0 ELSE 1 END,p2.id LIMIT 1)
      ORDER BY w.word COLLATE NOCASE,d.id
    """)
    grouped: dict[str, dict[str, object]] = {}
    meanings: defaultdict[str, set[str]] = defaultdict(set)
    for lemma, pos, sub_pos, definition, ipa in rows:
        lemma, meaning = clean(lemma, 80).lower(), clean(definition, 250)
        if not lemma or not meaning or len(meanings[lemma]) >= 12 or meaning in meanings[lemma]: continue
        if lemma not in grouped:
            grouped[lemma] = {"lemma": lemma, "partOfSpeech": clean(pos or sub_pos or "unknown", 80) or "unknown", "ipa": clean(ipa, 120) or None, "definitionEn": "", "meaningsVi": []}
        meanings[lemma].add(meaning)
        grouped[lemma]["meaningsVi"].append(meaning)
    entries = list(grouped.values())
    if not 1 <= len(entries) <= 200_000: raise SystemExit(f"Unexpected entry count: {len(entries)}")
    pack = {"schema":"context-lens.dictionary-pack","version":1,"id":"context-lens.skypedia.en-vi","name":"Context Lens English-Vietnamese (Skypedia)","packVersion":version,"license":{"name":"CC BY-SA 4.0","url":LICENSE_URL,"attribution":ATTRIBUTION},"entries":entries}
    pack_path = output_dir / f"context-lens-en-vi-{version}.json"
    pack_path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = pack_path.stat().st_size
    if size > 25*1024*1024: raise SystemExit(f"Pack is {size} bytes, above the 25 MiB installer limit")
    attribution_path = output_dir / "ATTRIBUTION.md"
    attribution_path.write_text(attribution_file.read_text(encoding="utf-8"), encoding="utf-8")
    digest = hashlib.sha256(pack_path.read_bytes()).hexdigest()
    manifest = {"schema":"context-lens.dictionary-release","version":1,"pack":pack_path.name,"packVersion":version,"entries":len(entries),"bytes":size,"sha256":digest,"license":"CC BY-SA 4.0","attribution":attribution_path.name,"source":"https://github.com/skypediacode/english-vietnamese-dictionary"}
    (output_dir/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (output_dir/"SHA256SUMS").write_text(f"{digest}  {pack_path.name}\n",encoding="ascii")
    print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("--source",type=Path,required=True); parser.add_argument("--attribution",type=Path,required=True); parser.add_argument("--output",type=Path,default=Path("release/dictionary")); parser.add_argument("--version",default="2026.09")
    args=parser.parse_args(); build(args.source,args.output,args.version,args.attribution)
