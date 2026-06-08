<div align="center">
  <img src="./mobile/assets/icon/app_icon.png" width="100" alt="Health Habit Hub"/>
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

- [Table of Contents](#table-of-contents)
- [The Big Picture](#the-big-picture)
- [What it is](#what-it-is)
- [Roles](#roles)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
  - [Common commands](#common-commands)
- [Tech Stack](#tech-stack)
- [Documentation](#documentation)


---

## The Big Picture

Health Habit Hub is fundamentally a **research data collection and analysis tool disguised as a personal health app**.

Participants donate their habits and health profile data. Researchers receive a structured, queryable graph of behaviours mapped to validated ontologies. The LLM layer turns that structured data into useful, evidence-grounded recommendations for the participant.

```
Better participation  →  Richer graph  →  Better recommendations  →  More participation
```

> Health Habit Hub combines mobile habit donation, questionnaire-based profiling, ontology-based semantic enrichment, graph-based research infrastructure, and RAG-supported recommendation generation into one integrated platform for studying and supporting health habit formation.


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
