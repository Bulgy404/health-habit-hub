# Health Habit Hub — Diagrams

All diagrams are **diagrams-as-code**: plain-text sources under version control,
reviewable in pull requests, and reproducibly exportable to SVG/PNG/PDF.

| Diagram | Format | Source |
|---|---|---|
| System architecture | Mermaid | [`architecture/system-architecture.mmd`](architecture/system-architecture.mmd) |
| Use case diagram | PlantUML | [`use-cases/use-case-diagram.puml`](use-cases/use-case-diagram.puml) |
| Use case catalogue (structured overview) | Markdown | [`use-cases/use-case-overview.md`](use-cases/use-case-overview.md) |
| Sequence diagrams (UC-01 … UC-39, one per use case, plus a supplementary LLM-pipeline flowchart) | Mermaid | [`sequences/`](sequences/) |
| Domain class diagram | Mermaid | [`classes/class-diagram.mmd`](classes/class-diagram.mmd) |

Mermaid was chosen because the repo's existing docs already use it and GitHub
renders it natively; PlantUML is used for the use case diagram because Mermaid
has no native UML use-case type.

## Viewing

- **GitHub** renders Mermaid blocks natively. For `.mmd` files use the
  [Mermaid Live Editor](https://mermaid.live) (paste the file content).
- **PlantUML**: use the [PlantUML web server](https://www.plantuml.com/plantuml),
  or the VS Code extensions *Mermaid Preview* / *PlantUML*.

## Rendering / exporting (reproducible)

Prerequisites: Node.js (for `mermaid-cli`) and Java or Docker (for PlantUML).

```bash
npm install -g @mermaid-js/mermaid-cli   # provides `mmdc`
```

Render everything:

```bash
cd docs/diagrams
make all          # SVG for every diagram → ./out/
make png          # PNG instead
make pdf          # PDF instead (Mermaid only)
```

Or render a single file:

```bash
mmdc -i architecture/system-architecture.mmd -o out/system-architecture.svg
mmdc -i sequences/UC-03-donate-habit.mmd -o out/UC-03-donate-habit.png -b transparent

# PlantUML (pick one)
plantuml -tsvg use-cases/use-case-diagram.puml -o ../out
docker run --rm -v "$PWD":/work -w /work plantuml/plantuml -tsvg use-cases/use-case-diagram.puml
```

## Conventions

- One use case per sequence diagram, named `UC-XX-<slug>.mmd`; IDs match the
  [use case overview](use-cases/use-case-overview.md) and the use case diagram.
- Participants ordered left→right: actor → client → backend → downstream services → stores.
- `alt`/`opt`/`par` blocks mirror actual branching in the code.
- Header comment in each file states the purpose and (where useful) the source files.

## Keeping diagrams current

Diagrams describe code under `app/`, `API-service/`, `admin/`, `mobile/`, and
`docker-compose.yml`. When you change a flow, update the matching diagram in the
same PR — the traceability table in the use case overview maps use cases to code.
