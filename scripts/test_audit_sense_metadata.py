"""Small deterministic tests for the metadata audit's ranking and candidate rules."""
import importlib.util
import json
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("audit_sense_metadata", Path(__file__).with_name("audit_sense_metadata.py"))
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def fixture(root: Path) -> None:
    (root / "release/dictionary").mkdir(parents=True)
    (root / "release/wordnet").mkdir(parents=True)
    dictionary = {"entries": [
        {"lemma": "bank", "meaningsVi": ["ngân hàng", "bờ sông", "ngân hàng"], "viSenses": [[101, "noun", 0], [102, "noun", 1]]},
        {"lemma": "run", "meaningsVi": ["chạy"], "viSenses": [[201, "verb", 0]]},
    ]}
    (root / "release/dictionary/manifest.json").write_text(json.dumps({"pack": "pack.json"}), encoding="utf-8")
    (root / "release/dictionary/pack.json").write_text(json.dumps(dictionary), encoding="utf-8")
    packs = {
        "wordnet-noun.json": {"pos": "n", "entries": {"bank": [0, 1, 2, 3], "run": [4]}, "synsets": [
            ["00000001", ["bank"], "a financial institution", ["They went to the bank."], []],
            ["00000002", ["bank"], "a river edge", ["We sat beside the bank."], []],
            ["00000003", ["bank"], "a reserve supply", [], []],
            ["00000004", ["bank"], "a set of objects", [], []],
            ["00000005", ["run"], "a period of operation", [], []],
        ]},
        "wordnet-verb.json": {"pos": "v", "entries": {"bank": [0], "run": [1]}, "synsets": [
            ["00000006", ["bank"], "to rely on", ["I bank on her."], [[1, 0]]],
            ["00000007", ["run"], "to move quickly on foot", ["They run fast."], []],
        ]},
        "wordnet-adj.json": {"pos": "a", "entries": {}, "synsets": []},
        "wordnet-adv.json": {"pos": "r", "entries": {}, "synsets": []},
    }
    for name, pack in packs.items():
        (root / "release/wordnet" / name).write_text(json.dumps(pack), encoding="utf-8")


class AuditTests(unittest.TestCase):
    def test_polysemy_priority_source_ids_bounded_and_no_reviewed_mapping(self):
        root = Path(__file__).resolve().parents[1] / "tmp" / "audit-test-fixture"
        if root.exists():
            import shutil
            shutil.rmtree(root)
        try:
            fixture(root)
            report, candidates = audit.build_audit(root, 2)
            rows = {row["lemma"]: row for row in report["lemmas"]}
            self.assertGreater(rows["bank"]["priorityScore"], rows["run"]["priorityScore"])
            self.assertEqual({sense["id"] for sense in audit.load_sources(root)[1]["bank"]}, {"101", "102"})
            self.assertEqual(candidates["reviewedMappingsCreated"], 0)
            self.assertTrue(all(not lemma["reviewedMappingsCreated"] for lemma in candidates["lemmas"]))
            self.assertTrue(all(len(group["candidates"]) <= 2 for lemma in candidates["lemmas"] for group in lemma["vietnameseCandidatesByEnglishSense"]))
        finally:
            import shutil
            shutil.rmtree(root, ignore_errors=True)

    def test_collocation_uniqueness_and_sharing(self):
        bank_unique = audit.extracted_collocations("They deposited money at the bank.", "bank")
        bank_shared = audit.extracted_collocations("We sat beside the bank.", "bank")
        self.assertTrue(bank_unique)
        self.assertTrue(bank_shared)
        owners = {"money at bank": {"sense-1"}, "beside bank": {"sense-1", "sense-2"}}
        self.assertEqual(len(owners["money at bank"]), 1)
        self.assertEqual(len(owners["beside bank"]), 2)


if __name__ == "__main__":
    unittest.main()
