#!/usr/bin/env python3
"""Validate the versioned course bank without changing the running application."""
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(value):
    return re.sub(r"\W+", " ", unicodedata.normalize("NFC", value).casefold()).strip()


def validate(source):
    assert len(source["chapters"]) == 8, "Expected eight chapters"
    questions = source["questions"]
    counts = Counter(q["chapter"] for q in questions)
    assert counts == Counter({n: 100 for n in range(1, 9)}), counts
    seen = set()
    bounds = {1: (13, 55), 2: (56, 85), 3: (86, 138), 4: (139, 171),
              5: (172, 202), 6: (203, 233), 7: (234, 268), 8: (269, 299)}
    for number, q in enumerate(questions, 1):
        prefix = f"Question {number}, chapter {q['chapter']}"
        text = normalize(q["text"])
        assert 10 <= len(q["text"]) <= 4000, prefix
        assert text not in seen, f"Duplicate: {prefix}: {q['text']}"
        seen.add(text)
        assert len(q["options"]) == 4, prefix
        assert all(isinstance(o, str) and o.strip() and len(o) <= 1000 for o in q["options"]), prefix
        assert len({normalize(o) for o in q["options"]}) == 4, prefix
        assert type(q["correct"]) is int and 0 <= q["correct"] < 4, prefix
        assert q["difficulty"] in {"EASY", "MEDIUM", "HARD"}, prefix
        assert q["explanation"].strip() and len(q["explanation"]) <= 4000, prefix
        assert q["source"] in {"blooket", "csv-nhom7", "textbook-authored", "textbook-2019-expanded"}, prefix
        for value in [q["text"], q["explanation"], *q["options"]]:
            assert not any(any(script in unicodedata.name(char, "") for script in
                               ("HEBREW", "ARABIC", "CYRILLIC", "CJK")) for char in value), f"Unexpected script: {prefix}"
        if q["source"] == "textbook-2019-expanded":
            assert q.get("topic") and q.get("sourcePages"), prefix
            pages = [int(p) for p in re.findall(r"\d+", q["sourcePages"])]
            low, high = bounds[q["chapter"]]
            assert pages and all(low <= p <= high for p in pages), f"Page outside chapter: {prefix}"
    return {
        "questions": len(questions), "chapterCounts": dict(sorted(counts.items())),
        "sources": dict(Counter(q["source"] for q in questions)),
        "difficulty": dict(Counter(q["difficulty"] for q in questions)),
        "answerPositions": dict(Counter(q["correct"] for q in questions)),
        "topicsPerChapter": {n: len({q.get("topic", q["source"]) for q in questions if q["chapter"] == n}) for n in counts},
        "scope": "Structure, provenance fields and exact normalized duplicates; not independent academic certification",
    }


if __name__ == "__main__":
    print(json.dumps(validate(json.loads((ROOT / "content/course-2019.json").read_text())), ensure_ascii=False, indent=2))
