<div align="center">
  <img src="./mobile/assets/icon/app_icon.png" width="120" alt="Health Habit Hub"/>
  <h1>Health Habit Hub</h1>
  <p><strong>A research platform for studying health habits.</strong></p>

  <p>
    <a href="https://github.com/Bulgy404/health-habit-hub/actions/workflows/ci.yml">
      <img src="https://github.com/Bulgy404/health-habit-hub/actions/workflows/ci.yml/badge.svg" alt="CI" />
    </a>
    <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-brightgreen" alt="Platform" />
    <img src="https://img.shields.io/badge/Flutter-3-02569B?logo=flutter" alt="Flutter 3" />
    <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js" alt="Node.js 22" />
    <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python" alt="Python 3.11+" />
    <img src="https://img.shields.io/badge/license-Proprietary-lightgrey" alt="License" />
  </p>

  <p>
    <a href="https://habit.wiwi.tu-dresden.de"><strong>habit.wiwi.tu-dresden.de</strong></a>
    &nbsp;·&nbsp;
    <a href="DOCUMENTATION.md">Docs</a>
    &nbsp;·&nbsp;
    <a href="DEPLOYMENT.md">Deployment</a>
    &nbsp;·&nbsp;
    <a href="CHANGELOG.md">Changelog</a>
  </p>
</div>

---

## Table of Contents

- [What it is](#what-it-is)
- [Roles](#roles)
- [Architecture](#architecture)
- [Data Stores](#data-stores)
- [Habit Donation Flow](#habit-donation-flow)
- [Questionnaire Flow](#questionnaire-flow)
- [Recommendation Flow](#recommendation-flow)
- [Knowledge Base Flow](#knowledge-base-flow)
- [The Big Picture](#the-big-picture)
- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Documentation](#documentation)

---

## What it is

Health Habit Hub is a research platform for studying health habits. Participants describe their personal health habits through a mobile app. The system stores, classifies, and organises those habits using a knowledge graph, then generates personalised recommendations using LLMs grounded in a researcher-curated knowledge base.

Researchers and admins manage studies, questionnaires, and the knowledge base through a web portal.

---

## Roles

| Role | What they do |
|---|---|
| `user` | Mobile app participant — donates habits, fills questionnaires, receives recommendations |
| `researcher` | Admin portal — reads data, views participant progress, limited write access |
| `admin` | Admin portal — full access: manage participants, upload KB documents, configure studies |

---

## Architecture

```
Flutter mobile app
      │  HTTPS via Traefik
      ▼
┌─────────────┐   ┌──────────────────┐
│  Node.js    │   │  Next.js Admin   │
│  Express    │   │  Panel           │
│  :3000      │   │  :3001           │
└──────┬──────┘   └────────┬─────────┘
       │                   │
       │   both talk to:   │
       ▼                   ▼
┌──────────────────────────────────────────────────┐
│  Keycloak     auth / identity      :8080/auth    │
├──────────────────────────────────────────────────┤
│  Neo4j        habit + user graph   bolt://7687   │
├──────────────────────────────────────────────────┤
│  MongoDB      questionnaires, surveys, profiles  │
├──────────────────────────────────────────────────┤
│  Fuseki       RDF ontology store                 │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────────┐
          │  Python FastAPI              │
          │  API-service / recommender   │
          │  :8000                       │
          │                             │
          │  · habit classification     │
          │  · BCIO ontology mapping    │
          │  · LLM recommendation       │
          └──────────┬──────────────────┘
                     │
           ┌─────────┴──────────┐
           ▼                    ▼
        LightRAG              Redis
        knowledge base        LLM response cache
        + RAG
```

Traefik sits in front of everything as the reverse proxy and TLS terminator. Internally, services communicate by container name.

---

## Data Stores

| Store | What lives there |
|---|---|
| **Neo4j** | Habits, Context nodes, BCIOConcept nodes, User nodes, Submission nodes, QuestionItem nodes |
| **MongoDB** | Questionnaire answers (`form_responses`), user profiles (`user_profiles`), surveys, study data |
| **Fuseki** | Legacy habit triples using the RDF/n10s schema; coexists alongside Neo4j |
| **LightRAG** | Researcher-uploaded documents processed into an entity-relation knowledge graph and vector index |
| **Redis** | LLM recommendation cache keyed by user + context hash |

---

## Habit Donation Flow

A user enters a habit — for example:

> *I go for a 30-min walk after dinner.*

```
User enters habit
      │
      ▼
Flutter mobile app
      │
      └─ POST /api/v1/habits/donate
                │
                ▼
         Node.js backend
                │
                ├─ Validates JWT via Keycloak
                │
                └─ Sends habit to Python API-service for classification
                          │
                          ├─ Detects language
                          ├─ Translates to English if needed (LibreTranslate)
                          ├─ Classifies context dimensions via LLM:
                          │     TIME · BEHAVIOR · PHYSICAL_SETTING
                          │     PRIOR_BEHAVIOR · OTHER_PEOPLE · etc.
                          └─ Maps contexts to BCIO ontology concepts
                               via embedding similarity (Qwen3-Embedding-4B)
                                    │
                                    ▼
                             Writes classified habit to Neo4j
```

### Neo4j representation

```cypher
(Habit {uuid, sentence, userID, language})
  -[:HAS_CONTEXT]->
(Context {text, dimension})
  -[:MAPS_TO]->
(BCIOConcept {bcio_concept_id, bcio_concept_label})
```

Each habit is classified into one or more context dimensions and mapped to a BCIO ontology concept, making the graph semantically queryable.

| Habit fragment | Context dimension |
|---|---|
| `after dinner` | `TIME` |
| `walking` | `BEHAVIOR` |

---

## Questionnaire Flow

Users periodically complete validated questionnaires:

| Questionnaire | Items | Purpose |
|---|---:|---|
| `SLIQ` | 4 | Diet, physical activity, smoking, and alcohol lifestyle index |
| `RAND-36` | 36 | General health survey across eight subscales |
| `SRHI` | 12 | Self-Report Habit Index |

```
User fills questionnaire in Flutter app
      │
      ▼
POST /api/v1/questionnaire-responses
      │
      ├─ MongoDB → insert into form_responses
      └─ Neo4j   → async, non-blocking graph write
```

### MongoDB document

```json
{
  "userId": "user-123",
  "questionnaireSlug": "sliq",
  "answers": { "sliq_diet": 3 },
  "submitted_at": "2026-05-10T12:00:00Z"
}
```

### Neo4j graph structure

```cypher
MERGE (u:User {userId: $userId})
CREATE (s:Submission {questionnaireId: 'sliq', submittedAt: $submittedAt})
CREATE (u)-[:SUBMITTED]->(s)
MERGE (qi:QuestionItem {id: 'sliq_diet', questionnaireId: 'sliq'})
CREATE (s)-[:HAS_SCORE {value: 3.0}]->(qi)
```

Multiple submissions over time build a longitudinal trajectory in the graph, queryable in chronological order. Any new questionnaire added by a researcher reuses the same code path without backend changes.

---

## Recommendation Flow

```
User requests recommendations in Flutter app
      │
      ▼
POST /api/v1/recommend  →  Node.js  →  Python API-service /recommend
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                       extract_habits                    extract_profile
                       Query Neo4j:                      Fetch SLIQ + RAND-36
                                                         from MongoDB +
                       MATCH (h:Habit {                  user_profile fields
                         is_habit: true,
                         userID: $uid                    LLM summarises into:
                       })-[:HAS_CONTEXT]->(c)            · profile_summary
                                                         · rag_query
                              │
                              └────────────────┬────────────────┘
                                               │
                                               ▼
                                    LightRAG hybrid retrieval
                                    POST /query { mode: "hybrid" }
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                             graph traversal       vector similarity
                                               │
                                               ▼
                                          LLM call
                                          (gpt-4o-mini / alias-ha)
                                               │
                                    Inputs:
                                    · user's habits
                                    · profile summary
                                    · knowledge base excerpts
                                               │
                                               ▼
                                    Personalised recommendation text
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                          MongoDB                            Redis
                     recommendations collection         cache (user + context hash)
```

Every recommendation is grounded in three sources of truth:

1. **User habits** — stored in Neo4j, semantically enriched via BCIO
2. **User profile** — derived from questionnaire scores and profile data
3. **Research knowledge** — retrieved from the LightRAG knowledge base

---

## Knowledge Base Flow

Admins upload research documents through the admin panel. LightRAG processes them into a queryable knowledge graph used at recommendation time.

```
Admin uploads PDF via admin panel
      │
      ▼
POST /api/v1/kb  →  Node.js  →  Python API-service  →  LightRAG
                                                              │
                                                   ┌──────────┴──────────┐
                                                   ▼                     ▼
                                            Chunk + embed          Extract entities
                                            (Qwen3-Embedding-4B    and relations
                                             2560-dim vectors)     via LLM
                                                   │                     │
                                                   └──────────┬──────────┘
                                                              ▼
                                                    Knowledge graph
                                                    + vector index
```

At recommendation time, LightRAG queries this index in **hybrid mode** — combining vector similarity over chunk embeddings with graph traversal over the entity-relation graph — and returns the most relevant excerpts.

This is what distinguishes HHH recommendations from generic LLM output: they are grounded in specific research documents curated by the research team.

---

## The Big Picture

Health Habit Hub is fundamentally a **research data collection and analysis tool disguised as a personal health app**.

Participants donate their habits and health profile data. Researchers receive a structured, queryable graph of behaviours mapped to validated ontologies. The LLM layer turns that structured data into useful, evidence-grounded recommendations for the participant.

```
Better participation  →  Richer graph  →  Better recommendations  →  More participation
```

> Health Habit Hub combines mobile habit donation, questionnaire-based profiling, ontology-based semantic enrichment, graph-based research infrastructure, and RAG-supported recommendation generation into one integrated platform for studying and supporting health habit formation.

---

## Quick Start

**Prerequisites:** Docker, Flutter SDK, Node.js 22, Python 3.11+

```bash
# 1. Clone and configure
git clone https://github.com/Bulgy404/health-habit-hub.git
cd health-habit-hub
cp .env.example .env          # fill in secrets — see .env.example for reference

# 2. Start all backend services
make dev

# 3. Seed MongoDB, Neo4j, and Keycloak with dev data
make seed

# 4. Run the Flutter app
make ios          # iPhone Simulator
# or open mobile/ in Android Studio for Android / web
```

Local service URLs after `make dev`:

| Service | URL |
|---|---|
| Flutter web | http://localhost |
| Backend API | http://localhost:3000 |
| Admin UI | http://admin.localhost |
| Keycloak | http://localhost:8080 |
| Neo4j Browser | http://localhost:7474 |
| Fuseki | http://localhost:3030 |
| LightRAG | http://localhost:9621 |
| LibreTranslate | http://localhost:5001 |
| Python AI service | http://localhost:8001 |
| Traefik dashboard | http://localhost:8888 |

### Common commands

| Command | Description |
|---|---|
| `make dev` | Start all services |
| `make stop` | Stop all services |
| `make seed` | Seed databases |
| `make reset` | Wipe volumes, restart, re-seed |
| `make logs` | Tail backend logs |
| `make test` | Run all test suites |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile / Web | Flutter 3, Dart, Riverpod, GoRouter, Firebase |
| Backend | Node.js 22, Express, ES modules |
| Admin | Next.js, NextAuth.js, TypeScript |
| AI service | Python 3.11, FastAPI, OpenAI-compatible LLM API |
| Knowledge RAG | LightRAG (graph + vector), FastMCP |
| Databases | MongoDB 7, Neo4j 5, Apache Jena Fuseki, PostgreSQL 16 |
| Cache / locks | Redis 7 |
| Identity | Keycloak 26 |
| Translation | LibreTranslate |
| Proxy / SSL | Traefik v3, Let's Encrypt |
| Infrastructure | Docker Compose, Portainer |

---

## Documentation

| Document | Description |
|---|---|
| [DOCUMENTATION.md](DOCUMENTATION.md) | Architecture deep-dive, backup, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [AUDIT.md](AUDIT.md) | Security audit log |
| [docs/guides/local-dev.md](docs/guides/local-dev.md) | Step-by-step local dev setup |

---

**Contact:** felix.reinsch@tu-dresden.de &nbsp;·&nbsp; **Issues:** https://github.com/Bulgy404/health-habit-hub/issues &nbsp;·&nbsp; Proprietary — research use at TU Dresden
