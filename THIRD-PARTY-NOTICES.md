# Third-party notices

Third-party content redistributed in, or accessed by, this project, together
with the attribution its licence requires.

---

## Behaviour Change Intervention Ontology (BCIO)

- **File in this repository:** `API-service/data/bcio.owl`
- **Version:** `2026-04-28` (see the `versionIRI` in the file)
- **Source:** <http://humanbehaviourchange.org/ontology/bcio.owl>
- **Project:** The Human Behaviour-Change Project — a collaboration of
  University College London, the University of Aberdeen, IBM Research and the
  National Institute for Health and Care Research (NIHR).

**How it is used.** The API-service maps free-text habit contexts to BCIO
concepts (`POST /api/v1/llm/map-bcio`, RAG over `bcio.owl`). Matched concepts
are stored as `(:BCIOConcept {uri})` nodes in Neo4j and may be surfaced in the
app as labels on a donated habit.

**Attribution.** The Behaviour Change Intervention Ontology is a product of the
Human Behaviour-Change Project and is used here with attribution to its authors.
Please cite the ontology when reporting results derived from it. This project
claims no ownership of BCIO, and BCIO's authors do not endorse this project.

> If you update `bcio.owl`, re-check the licence terms published at
> <https://www.humanbehaviourchange.org/> and update the version above.

---

## LightRAG knowledge corpus

The documents that populate the LightRAG knowledge base are **not** part of this
repository and are **not** included in the published Docker image. They are
supplied at deploy time via a read-only bind mount — see
[`lightrag/knowledge/README.md`](lightrag/knowledge/README.md).

This is deliberate: the corpus may contain copyright-protected literature that
we are not licensed to redistribute, and this repository is public. Only
documents whose licence permits redistribution, or which the operator holds the
rights to, may be placed there.

---

## User-generated content

Habits, comments and questionnaire answers displayed in the app are authored by
study participants. They remain the contribution of their authors and are
processed under the consent obtained at study enrolment — see the
[privacy policy](https://habit.wiwi.tu-dresden.de/en/privacy).
