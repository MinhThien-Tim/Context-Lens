#!/usr/bin/env python3
"""Create a compact, deterministic review queue from bundled lexical metadata.

This is an audit only: candidate edges are evidence summaries, never reviewed pairs.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WORDNET_FILES = ("wordnet-noun.json", "wordnet-verb.json", "wordnet-adj.json", "wordnet-adv.json")
POS_NAMES = {"n": "noun", "v": "verb", "a": "adjective", "r": "adverb"}
TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?", re.I)
STOP = {"a", "an", "the", "to", "of", "in", "on", "at", "by", "for", "with", "from", "and", "or", "that", "which", "who", "someone", "something", "one", "be", "have", "do"}


def normalize(value: str) -> str:
    return " ".join(value.lower().replace("_", " ").split())


def tokens(value: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(value)]


def lemma_forms(lemma: str) -> set[str]:
    """Small, conservative suffix normalization for example matching."""
    result = {lemma}
    if " " in lemma or "-" in lemma or "'" in lemma:
        return result
    if lemma.endswith("ies") and len(lemma) > 4:
        result.add(lemma[:-3] + "y")
    if lemma.endswith("ing") and len(lemma) > 5:
        result.update((lemma[:-3], lemma[:-3] + "e"))
        if len(lemma) > 5 and lemma[-4] == lemma[-5]:
            result.add(lemma[:-4])
    if lemma.endswith("ed") and len(lemma) > 4:
        result.update((lemma[:-2], lemma[:-1]))
        if lemma[-3:-2] == lemma[-4:-3]:
            result.add(lemma[:-3])
    if lemma.endswith("s") and len(lemma) > 3:
        result.add(lemma[:-1])
    return result


def lemma_positions(example: str, lemma: str) -> list[int]:
    words = tokens(example)
    forms = lemma_forms(lemma)
    return [i for i, word in enumerate(words) if word in forms]


def extracted_collocations(example: str, lemma: str) -> list[str]:
    words = tokens(example)
    result = []
    for index in lemma_positions(example, lemma):
        lo, hi = max(0, index - 3), min(len(words), index + 4)
        left = words[lo:index]
        right = words[index + 1:hi]
        # Keep local content words/prepositions/particles; skip generic articles.
        left = [word for word in left if word not in {"a", "an", "the"}]
        right = [word for word in right if word not in {"a", "an", "the"}]
        shape = " ".join(left[-2:] + [lemma] + right[:2]).strip()
        if shape != lemma:
            result.append(shape)
    return result


def example_quality(examples: list[str], lemma: str) -> str:
    if not examples:
        return "missing"
    for example in examples:
        words = tokens(example)
        if len(lemma_positions(example, lemma)) != 1:
            continue
        position = lemma_positions(example, lemma)[0]
        before, after = words[:position], words[position + 1:]
        if any(w in {"to", "that", "of", "about", "into", "for", "on", "with", "at", "up", "out"} for w in before[-3:] + after[:4]):
            return "structurally-useful"
        content = [w for w in words if w not in STOP and w not in lemma_forms(lemma)]
        if len(content) >= 3:
            return "structurally-useful"
    return "generic"


def broad_gloss(gloss: str) -> bool:
    text = gloss.strip()
    return len(text) <= 12 or len(tokens(text)) <= 2


def load_sources(root: Path) -> tuple[dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]]]:
    manifest = json.loads((root / "release/dictionary/manifest.json").read_text(encoding="utf-8"))
    dictionary = json.loads((root / "release/dictionary" / manifest["pack"]).read_text(encoding="utf-8"))
    vi_by_lemma: dict[str, list[dict[str, Any]]] = {}
    for entry in dictionary["entries"]:
        lemma = normalize(entry["lemma"])
        senses = []
        for raw in entry.get("viSenses", []):
            sense_id, pos, gloss_index, *example = raw
            senses.append({"id": str(sense_id), "pos": normalize(pos), "glosses": [entry["meaningsVi"][gloss_index]], "examples": example[:1]})
        vi_by_lemma[lemma] = senses

    en_by_lemma: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for filename in WORDNET_FILES:
        pack = json.loads((root / "release/wordnet" / filename).read_text(encoding="utf-8"))
        pos = POS_NAMES[pack["pos"]]
        for raw_lemma, indices in pack["entries"].items():
            lemma = normalize(raw_lemma)
            if not re.fullmatch(r"[a-z][a-z' -]*", lemma):
                continue
            for index in indices:
                offset, words, definition, examples, frames = pack["synsets"][index]
                word_index = next((i + 1 for i, word in enumerate(words) if normalize(word) == lemma), 0)
                relevant_frames = sorted({frame for frame, target in (frames or []) if target in (0, word_index)})
                en_by_lemma[lemma].append({
                    "id": f"wn3:{pack['pos']}:{offset}", "lemma": lemma, "pos": pos,
                    "definition": definition, "examples": examples,
                    "verbFrames": relevant_frames, "_synonyms": [w for w in words if normalize(w) != lemma],
                })
    return en_by_lemma, vi_by_lemma


def lexical_terms(sense: dict[str, Any]) -> set[str]:
    terms = {word for word in tokens(sense["definition"]) if word not in STOP and len(word) > 3}
    terms.update(word for synonym in sense["_synonyms"] for word in tokens(synonym) if len(word) > 3)
    return terms


def candidate_evidence(en: dict[str, Any], vi: dict[str, Any]) -> list[str]:
    evidence = []
    if en["pos"] == vi["pos"]:
        evidence.append("same-pos")
    en_terms, vi_terms = lexical_terms(en), {word for gloss in vi["glosses"] for word in tokens(gloss) if len(word) > 3}
    overlap = sorted(en_terms & vi_terms)
    if overlap:
        evidence.append("lexical-overlap:" + ",".join(overlap[:4]))
    if en["pos"] == "verb":
        vi_words = " ".join(vi["glosses"] + vi.get("examples", []))
        vi_example_tokens = set(tokens(vi_words))
        if en["verbFrames"]:
            evidence.append("wordnet-verb-frames-present")
        if vi_example_tokens & {"to", "about", "of", "for", "on", "with", "into", "up"}:
            evidence.append("source-preposition-cue")
    # Always preserve a small same-POS review shortlist; evidence describes why,
    # it does not assert semantic truth or establish an alignment.
    return evidence


def build_audit(root: Path, top_candidates: int = 3) -> tuple[dict[str, Any], dict[str, Any]]:
    en_by_lemma, vi_by_lemma = load_sources(root)
    audit_rows = []
    candidate_rows = []
    high_count = 0
    for lemma, english in en_by_lemma.items():
        vi_senses = vi_by_lemma.get(lemma, [])
        pos_count = len({s["pos"] for s in english})
        # Only current alignment metadata counts as paired. Lexical overlap is
        # candidate evidence and must never silently become an alignment.
        paired = 0
        unresolved_en = len(english) - paired
        unresolved_vi = max(0, len(vi_senses) - paired)
        examples_count = sum(bool(s["examples"]) for s in english)
        frame_count = sum(bool(s["verbFrames"]) for s in english)
        qualities = [example_quality(s["examples"], lemma) for s in english]
        glosses = [g for v in vi_senses for g in v["glosses"]]
        collocation_counter: Counter[str] = Counter()
        collocation_owners: dict[str, set[str]] = defaultdict(set)
        patterns: dict[str, list[dict[str, Any]]] = {}
        for sense in english:
            extracted = [shape for example in sense["examples"] for shape in extracted_collocations(example, lemma)]
            counts = Counter(extracted)
            for shape in counts:
                collocation_counter[shape] += counts[shape]
                collocation_owners[shape].add(sense["id"])
            patterns[sense["id"]] = [{"text": shape, "count": count} for shape, count in sorted(counts.items())]
        distinctiveness = sum(1 for owners in collocation_owners.values() if len(owners) == 1)
        shared_overlap = sum(max(0, len(owners) - 1) for owners in collocation_owners.values())
        unresolved_fraction = unresolved_vi / max(1, len(vi_senses))
        example_deficit = 1 - examples_count / max(1, len(english))
        discrim_deficit = 1 - min(1, distinctiveness / max(1, len(english)))
        # Polysemy contributes a capped tie-breaker, never the main priority driver.
        score = round(3 * min(1, unresolved_fraction) + 2 * pos_count + 2 * example_deficit + 2 * discrim_deficit + min(2, shared_overlap) + min(2, len(english) / 8) + min(2, max(0, len(english) - 1) / 3), 2)
        tier = "HIGH" if score >= 8 else "MEDIUM" if score >= 5 else "LOW"
        alignment = "mixed" if 0 < paired < len(english) else "paired" if paired and paired == len(english) else "unresolved"
        row = {
            "lemma": lemma, "posCount": pos_count, "englishSenseCount": len(english),
            "vietnameseSourceSenseCount": len(vi_senses), "pairedSenseCount": paired,
            "unresolvedEnglishSenseCount": unresolved_en, "unresolvedVietnameseSourceSenseCount": unresolved_vi,
            "sensesWithExamples": examples_count, "sensesWithVerbFrames": frame_count,
            "sensesWithCollocations": sum(bool(patterns[s["id"]]) for s in english), "sensesWithGrammarPatterns": 0,
            "sharedFrameOrConstructionOverlap": shared_overlap, "broadOrShortViGlossCount": sum(broad_gloss(g) for g in glosses),
            "currentAlignmentStatus": alignment, "metadataCompletenessScore": round(1 - (example_deficit + discrim_deficit) / 2, 3),
            "priorityScore": score, "priority": tier, "uniqueExtractedCollocations": distinctiveness,
            "missingExamples": len(english) - examples_count, "exampleQualityCounts": dict(Counter(qualities)),
            "priorityReasons": [reason for condition, reason in [
                (unresolved_vi > 0, "unresolved source senses"), (pos_count > 1, "multiple parts of speech"),
                (example_deficit > .5, "few senses have examples"), (discrim_deficit > .5, "few distinctive extracted collocations"),
                (shared_overlap > 0, "examples share usage shapes"), (len(english) >= 8, "polysemy raises review value")
            ] if condition]
        }
        audit_rows.append(row)
        # The review queue is deliberately capped so outputs stay compact.
        if tier == "HIGH" and high_count < 500:
            high_count += 1
            candidate_english = []
            for sense in english:
                enriched = dict(sense)
                enriched.pop("_synonyms", None)
                enriched["collocationCandidates"] = [
                    {"text": item["text"], "count": item["count"], "sharing": (
                        "unique-to-sense" if len(collocation_owners[item["text"]]) == 1 else
                        "shared-by-few-senses" if len(collocation_owners[item["text"]]) <= 3 else "shared-broadly"
                    )} for item in patterns[sense["id"]]
                ]
                enriched["exampleQuality"] = example_quality(sense["examples"], lemma)
                enriched["currentAlignment"] = {"status": "unresolved", "reviewed": False}
                candidate_english.append(enriched)
            possible = []
            for sense in english:
                compatible = []
                for vi in vi_senses:
                    if vi["pos"] != sense["pos"]:
                        continue
                    evidence = candidate_evidence(sense, vi)
                    compatible.append({"sourceSenseId": vi["id"], "pos": vi["pos"], "glosses": vi["glosses"], "sourceExample": (vi.get("examples") or [None])[0], "evidence": evidence, "reviewed": False})
                compatible.sort(key=lambda item: (-len(item["evidence"]), item["sourceSenseId"]))
                possible.append({"englishSenseId": sense["id"], "candidates": compatible[:top_candidates]})
            candidate_rows.append({"lemma": lemma, "priority": tier, "priorityScore": score, "englishSenses": candidate_english, "vietnameseCandidatesByEnglishSense": possible, "reviewedMappingsCreated": 0})
    audit_rows.sort(key=lambda item: (-item["priorityScore"], -item["englishSenseCount"], item["lemma"]))
    candidate_rows.sort(key=lambda item: (-item["priorityScore"], item["lemma"]))
    audit = {"schema": "context-lens.metadata-audit.v1", "sources": {"wordnet": "release/wordnet/*", "dictionary": "release/dictionary/" + json.loads((root / "release/dictionary/manifest.json").read_text(encoding="utf-8"))["pack"]}, "priorityFormula": "3*unresolved-VI-fraction + 2*POS-count + 2*example-deficit + 2*distinctiveness-deficit + min(2, shared usage overlap) + min(2, English senses/8) + min(2, (English senses-1)/3); HIGH >= 8, MEDIUM >= 5, else LOW", "counts": {"lemmas": len(audit_rows), "high": sum(r["priority"] == "HIGH" for r in audit_rows), "medium": sum(r["priority"] == "MEDIUM" for r in audit_rows), "low": sum(r["priority"] == "LOW" for r in audit_rows), "unresolvedEnglishSenses": sum(r["unresolvedEnglishSenseCount"] for r in audit_rows), "unresolvedVietnameseSourceSenses": sum(r["unresolvedVietnameseSourceSenseCount"] for r in audit_rows), "missingCollocations": sum(r["sensesWithCollocations"] == 0 for r in audit_rows), "missingExamples": sum(r["missingExamples"] for r in audit_rows)}, "lemmas": audit_rows}
    candidates = {"schema": "context-lens.metadata-candidates.v1", "reviewedMappingsCreated": 0, "candidateLemmaCount": len(candidate_rows), "candidateLemmaLimit": 500, "lemmas": candidate_rows}
    return audit, candidates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "tmp")
    parser.add_argument("--top-vi-candidates", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.top_vi_candidates <= 3:
        parser.error("--top-vi-candidates must be between 1 and 3")
    audit, candidates = build_audit(args.root, args.top_vi_candidates)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    audit_path, candidates_path, summary_path = (args.output_dir / name for name in ("metadata-audit.json", "metadata-candidates.json", "metadata-audit-summary.md"))
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    candidates_path.write_text(json.dumps(candidates, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    high = [row for row in audit["lemmas"] if row["priority"] == "HIGH"][:50]
    lines = ["# Metadata audit summary", "", f"- Lemmas: {audit['counts']['lemmas']:,} (HIGH {audit['counts']['high']:,}, MEDIUM {audit['counts']['medium']:,}, LOW {audit['counts']['low']:,})", f"- Unresolved English senses: {audit['counts']['unresolvedEnglishSenses']:,}", f"- Unresolved Vietnamese source senses: {audit['counts']['unresolvedVietnameseSourceSenses']:,}", f"- Missing examples: {audit['counts']['missingExamples']:,}", f"- Lemmas with no extracted collocations: {audit['counts']['missingCollocations']:,}", "- Priority combines unresolved source coverage, POS diversity, missing/discriminative usage metadata, shared usage overlap, and capped polysemy contributions.", "", "## Top HIGH priority lemmas", "", "| Lemma | Score | EN senses | VI source senses | Unresolved VI | Reasons |", "|---|---:|---:|---:|---:|---|"]
    lines.extend(f"| {r['lemma']} | {r['priorityScore']:.2f} | {r['englishSenseCount']} | {r['vietnameseSourceSenseCount']} | {r['unresolvedVietnameseSourceSenseCount']} | {', '.join(r['priorityReasons']) or 'metadata audit'} |" for r in high)
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(audit_path), "auditBytes": audit_path.stat().st_size, "candidates": str(candidates_path), "candidateBytes": candidates_path.stat().st_size, "summary": str(summary_path), "counts": audit["counts"], "topHigh": [r["lemma"] for r in high[:10]]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
