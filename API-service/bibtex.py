"""Parse a single BibLaTeX/BibTeX entry into knowledge-base reference metadata.

Uploading a paper used to be two steps: push the PDF through the knowledge
tab, then hand-edit ``data/references.json`` so the citation and DOI link
existed. The second step is easy to forget and invisible when forgotten — the
paper is retrieved and cited, just as a bare filename with no link.

A BibLaTeX entry is what a reference manager already puts on the clipboard, and
it carries everything ``citations.build_citation`` otherwise has to guess out of
a filename: authors, year, title, and a DOI that becomes a real link.

Deliberately hand-written rather than pulling in a parser dependency. The job is
one entry at a time from a trusted admin paste, not a whole .bib library, and
the brace/quote handling below is the only genuinely fiddly part.
"""

from __future__ import annotations

import re
from typing import Any

# @article{key, ...  — the type and cite key that open an entry.
_ENTRY_RE = re.compile(r"@(?P<type>[A-Za-z]+)\s*\{\s*(?P<key>[^,\s}]*)\s*,", re.DOTALL)

# LaTeX escapes that survive into display text often enough to be worth undoing.
_LATEX_REPLACEMENTS = (
    (r"\&", "&"),
    (r"\%", "%"),
    (r"\_", "_"),
    (r"\$", "$"),
    (r"\#", "#"),
    ("~", " "),
    ("--", "–"),
)

# Fields we keep. Anything else in the entry is ignored rather than stored:
# `file` in particular points at somebody's local Zotero directory and has no
# business in a shared database.
_WANTED = {
    "title",
    "shorttitle",
    "author",
    "editor",
    "date",
    "year",
    "journaltitle",
    "journal",
    "shortjournal",
    "booktitle",
    "publisher",
    "volume",
    "number",
    "pages",
    "doi",
    "issn",
    "isbn",
    "url",
    "urldate",
    "abstract",
    "keywords",
    "langid",
    "eprint",
    "eprinttype",
    "pmcid",
}


class BibtexError(ValueError):
    """Raised when a paste cannot be read as a BibLaTeX entry."""


def _strip_wrapping(value: str) -> str:
    """Remove one layer of {...} or "..." and tidy whitespace."""
    value = value.strip()
    while len(value) >= 2 and (
        (value[0] == "{" and value[-1] == "}") or (value[0] == '"' and value[-1] == '"')
    ):
        inner = value[1:-1]
        # Only unwrap when the delimiters actually pair around the whole value:
        # "{A} and {B}" must survive intact.
        if value[0] == "{" and _first_unbalanced(inner) is not None:
            break
        value = inner.strip()
    for latex, plain in _LATEX_REPLACEMENTS:
        value = value.replace(latex, plain)
    # Braces used purely to protect capitalisation ({DNA}) carry no meaning here.
    value = value.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", value).strip()


def _first_unbalanced(text: str) -> int | None:
    """Index of the first brace that closes more than has been opened, if any."""
    depth = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                return i
    return None


def _split_fields(body: str) -> dict[str, str]:
    """Split an entry body into field -> raw value, respecting nested braces.

    A naive split on "," destroys any field containing one, which for these
    entries means every author list and most abstracts.
    """
    fields: dict[str, str] = {}
    key: list[str] = []
    value: list[str] = []
    depth = 0
    in_quotes = False
    seen_equals = False

    for ch in body:
        if not seen_equals:
            if ch == "=":
                seen_equals = True
            elif ch == ",":
                key = []
            else:
                key.append(ch)
            continue

        if ch == '"' and depth == 0:
            in_quotes = not in_quotes
            value.append(ch)
            continue
        if not in_quotes:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            elif ch == "," and depth == 0:
                name = "".join(key).strip().lower()
                if name:
                    fields[name] = "".join(value)
                key, value, seen_equals = [], [], False
                continue
        value.append(ch)

    name = "".join(key).strip().lower()
    if name and seen_equals:
        fields[name] = "".join(value)
    return fields


def _format_authors(raw: str) -> str:
    """Render a BibLaTeX author list the way a citation line reads.

    One author is "Elsheikh", two are "Elsheikh and Al-Thani", three or more
    become "Elsheikh et al." — matching the existing Zotero-derived citations so
    a curated entry and a parsed filename do not look like different systems.
    """
    if not raw:
        return ""
    people = [p.strip() for p in re.split(r"\s+and\s+", raw) if p.strip()]
    surnames = []
    for person in people:
        # "Surname, Given" is unambiguous; "Given Surname" we take the last word.
        surnames.append(
            person.split(",")[0].strip() if "," in person else person.split()[-1]
        )
    if not surnames:
        return ""
    if len(surnames) == 1:
        return surnames[0]
    if len(surnames) == 2:
        return f"{surnames[0]} and {surnames[1]}"
    return f"{surnames[0]} et al."


def _extract_year(fields: dict[str, str]) -> str:
    """Pull a four-digit year out of `date` (BibLaTeX) or `year` (BibTeX)."""
    for name in ("date", "year"):
        match = re.search(r"\d{4}", fields.get(name, ""))
        if match:
            return match.group(0)
    return ""


def parse_entry(text: str) -> dict[str, Any]:
    """Parse one BibLaTeX entry into a reference record.

    Args:
        text: The pasted entry, e.g. ``@article{key, title = {...}, ...}``.

    Returns:
        A dict with ``entryType``, ``citeKey``, ``title``, ``authors``,
        ``year``, ``url``, ``doi``, ``journal``, plus the raw ``bibtex`` and a
        ``fields`` map of everything else worth keeping.

    Raises:
        BibtexError: If no entry can be found, or it has neither title nor author.
    """
    if not text or not text.strip():
        raise BibtexError("No BibLaTeX entry given.")

    match = _ENTRY_RE.search(text)
    if not match:
        raise BibtexError(
            "Could not find a BibLaTeX entry — expected something like "
            "'@article{key, title = {...}}'."
        )

    body = text[match.end() :]
    closing = _first_unbalanced(body)
    if closing is not None:
        body = body[:closing]

    raw_fields = _split_fields(body)
    fields = {
        name: _strip_wrapping(value)
        for name, value in raw_fields.items()
        if name in _WANTED
    }

    title = fields.get("title") or fields.get("shorttitle") or ""
    authors = _format_authors(fields.get("author") or fields.get("editor") or "")
    year = _extract_year(fields)
    doi = fields.get("doi", "")

    if not title and not authors:
        raise BibtexError(
            "The entry has neither a title nor an author — it is probably truncated."
        )

    # A DOI is the durable link; an explicit url is the fallback. Never guessed:
    # a wrong link on a citation is worse than no link.
    url = f"https://doi.org/{doi}" if doi else fields.get("url", "")

    return {
        "entryType": match.group("type").lower(),
        "citeKey": match.group("key"),
        "title": title,
        "authors": authors,
        "year": year,
        "doi": doi,
        "url": url,
        "journal": fields.get("journaltitle") or fields.get("journal") or "",
        "bibtex": text.strip(),
        "fields": fields,
    }
