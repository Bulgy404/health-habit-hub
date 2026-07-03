"""Map knowledge-base document filenames to human-readable citations with links.

Knowledge-base PDFs follow the Zotero export pattern
"Authors - Year - Title.pdf" (e.g. "Wood and Rünger - 2016 - Psychology of
Habit.pdf"). This module parses that pattern into a citation and resolves a
link for each paper:

  1. If ``data/references.json`` contains an entry for the filename, its
     ``url`` (ideally a DOI link) and optional ``title``/``authors``/``year``
     win.
  2. Otherwise no link is attached — the citation is shown as plain
     "Author (Year) — Title" text. We never fabricate or guess links.

``data/references.json`` format (all fields except ``url`` optional)::

    {
      "Wood and Rünger - 2016 - Psychology of Habit.pdf": {
        "url": "https://doi.org/10.1146/annurev-psych-122414-033417",
        "title": "Psychology of Habit"
      }
    }
"""
import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REFERENCES_PATH = Path(__file__).parent / "data" / "references.json"

# "Authors - Year - Title.ext" (Zotero file-naming convention)
_ZOTERO_RE = re.compile(
    r"^(?P<authors>.+?)\s+-\s+(?P<year>\d{4})\s+-\s+(?P<title>.+?)\.(?:pdf|txt|md)$",
    re.IGNORECASE,
)


def _load_references() -> dict[str, dict[str, Any]]:
    try:
        return json.loads(_REFERENCES_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as exc:  # noqa: BLE001
        logger.warning("Could not read %s: %s", _REFERENCES_PATH, exc)
        return {}


_REFERENCES = _load_references()


def build_citation(filename: str) -> dict[str, str]:
    """Return citation metadata for a knowledge-base document.

    Args:
        filename: Document filename as stored in the knowledge base.

    Returns:
        Dict with keys ``filename``, ``title``, ``authors``, ``year``,
        ``url``, and ``citation`` (a preformatted display string such as
        "Wood and Rünger (2016) — Psychology of Habit").
    """
    ref = _REFERENCES.get(filename, {})
    match = _ZOTERO_RE.match(filename)
    if match:
        authors = ref.get("authors", match.group("authors").strip())
        year = str(ref.get("year", match.group("year")))
        title = ref.get("title", match.group("title").strip())
    else:
        stem = filename.rsplit(".", 1)[0]
        authors = ref.get("authors", "")
        year = str(ref.get("year", ""))
        title = ref.get("title", stem)

    # Link only when curated (DOI or publisher page) — no guessed links.
    url = ref.get("url", "")

    if authors and year:
        citation = f"{authors} ({year}) — {title}"
    elif year:
        citation = f"{title} ({year})"
    else:
        citation = title

    return {
        "filename": filename,
        "title": title,
        "authors": authors,
        "year": year,
        "url": url,
        "citation": citation,
    }


_FILENAME_RE = re.compile(r"([^\\/\n\r\t\"'|<>{}\[\]]{3,150}?\.(?:pdf|txt|md))\b", re.IGNORECASE)


def extract_document_filenames(context: str) -> list[str]:
    """Extract distinct knowledge-base document filenames from a LightRAG context blob.

    LightRAG includes the source document's ``file_path`` in the chunk and
    entity sections of the context it returns; this pulls those out in order
    of first appearance.
    """
    seen: set[str] = set()
    result: list[str] = []
    for raw in _FILENAME_RE.findall(context):
        name = raw.strip().lstrip(":,;")
        # Drop a leading "file_path" style label if the regex swallowed one.
        name = re.sub(r"^(file[_ ]?path|source|document)\s*[:=]?\s*", "", name, flags=re.IGNORECASE).strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            result.append(name)
    return result
