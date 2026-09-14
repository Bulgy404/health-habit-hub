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

#: Curated references written by the knowledge tab, one document per KB file.
#: The JSON above stays as the fallback for papers indexed before the tab could
#: record a citation; anything in Mongo wins over it.
REFERENCES_COLLECTION = "kb_references"


async def load_references(db: Any) -> dict[str, dict[str, Any]]:
    """Merge the curated Mongo references over the shipped JSON ones.

    Args:
        db: Motor database handle, or None to use only the shipped file.

    Returns:
        Mapping of knowledge-base filename to reference metadata.
    """
    merged: dict[str, dict[str, Any]] = dict(_REFERENCES)
    if db is None:
        return merged
    try:
        cursor = db[REFERENCES_COLLECTION].find({})
        async for doc in cursor:
            filename = doc.get("filename")
            if filename:
                merged[filename] = doc
    except Exception as exc:  # noqa: BLE001
        # A citation is a nicety; retrieval must not fail because the reference
        # store is unreachable. Fall back to whatever the image shipped with.
        logger.warning("Could not read %s: %s", REFERENCES_COLLECTION, exc)
    return merged


def build_citation(
    filename: str, references: dict[str, dict[str, Any]] | None = None
) -> dict[str, str]:
    """Return citation metadata for a knowledge-base document.

    Args:
        filename: Document filename as stored in the knowledge base.
        references: Reference mapping to consult, as returned by
            :func:`load_references`. Defaults to the shipped JSON alone.

    Returns:
        Dict with keys ``filename``, ``title``, ``authors``, ``year``,
        ``url``, and ``citation`` (a preformatted display string such as
        "Wood and Rünger (2016) — Psychology of Habit").
    """
    ref = (_REFERENCES if references is None else references).get(filename, {})
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
