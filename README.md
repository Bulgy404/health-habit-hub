# Health Habit Hub

<img src="./app/public/pics/h3-logo.png" width="250" alt="Health Habit Hub Logo"/>

**Production URL**: https://habit.wiwi.tu-dresden.de

A research platform for collecting and analysing health habit data. Participants donate habits via a mobile app; researchers manage studies and analyse results via a web admin; a Python AI service classifies habits, maps them to BCIO behaviour change techniques, and generates personalised recommendations.

---

## Architecture

```
Internet (80/443)
       |
   Traefik (SSL / reverse proxy)
       |
   ┌───┴────────────────────────────────────────┐
   │                                            │
Node.js/Express backend (app/)      Next.js admin (admin/)
       |                                        |
       ├── Python FastAPI / AI service (API-service/)
       |        └── Redis (recommendation cache)
       |
       ├── MongoDB  (surveys & responses)
       ├── Neo4j    (habit graph)
       ├── Apache Fuseki  (RDF/SPARQL ontology)
       ├── Keycloak (identity provider)
       └── LibreTranslate (EN↔DE translation)
```

| Component | Location | Tech |
|---|---|---|
| Mobile app | `mobile/` | Flutter (iOS / Android / web), Keycloak PKCE |
| Backend API | `app/` | Node.js 22, Express, ES modules |
| Admin UI | `admin/` | Next.js, NextAuth, Keycloak (admin/researcher role) |
| AI service | `API-service/` | Python, FastAPI, OpenAI LLM |
| Proxy | — | Traefik + Let's Encrypt |
| Backup | — | Daily automated backups, 14-day retention |

---

## Quick Start (local dev)

**Prerequisites**: Docker, Flutter SDK, Node.js 22, Python 3.11+.

```bash
# 1. Clone and configure
git clone https://github.com/felixreinsch/health-habit-hub.git
cd health-habit-hub
cp .env.example .env          # then fill in secrets (see Env Vars below)

# 2. Start all backend services
make dev

# 3. Seed MongoDB, Neo4j, and Keycloak with dev data
make seed

# 4. Run the Flutter app in the iOS Simulator
make ios
```

Local service URLs after `make dev`:

| Service | URL |
|---|---|
| Backend API | http://localhost:3000 |
| Admin UI | http://admin.localhost |
| Keycloak | http://localhost:8080 |
| Neo4j Browser | http://localhost:7474 |
| Fuseki | http://localhost:3030 |
| LibreTranslate | http://localhost:5001 |
| Python AI service | http://localhost:8001 |
| Traefik dashboard | http://localhost:8888 |

---

## Common `make` Commands

| Command | Description |
|---|---|
| `make dev` | Start all local services via Docker Compose |
| `make stop` | Stop all local services |
| `make seed` | Seed MongoDB, Neo4j, and Keycloak with dev data |
| `make logs` | Tail backend app logs |
| `make logs-all` | Tail all service logs |
| `make ios` | Run Flutter app on iPhone Simulator |
| `make reset` | Wipe volumes, restart, and re-seed |
| `make test` | Run all test suites (no Docker required) |

---

## Testing

Run every test suite in one command:

```bash
make test
```

Or run suites individually:

```bash
# Backend: lint + unit tests + security audit
make test-backend

# Flutter: analyze + widget/unit tests
make test-flutter

# Python AI-service: pytest
make test-python

# Admin: typecheck + Jest/RTL tests
make test-admin

# Admin Jest tests directly
cd admin && npm test
```

---

## Key Environment Variables

Copy `stack.env` as a starting point for production; copy `.env.example` for local dev. Variables that **must** be overridden before running:

| Variable | Description |
|---|---|
| `NEO4J_PASSWORD` | Neo4j database password |
| `MONGO_PASSWORD` | MongoDB root password |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin console password |
| `KC_DB_PASSWORD` | Keycloak's PostgreSQL password |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Secret for the `hhh-backend` confidential Keycloak client |
| `API_SERVICE_SECRET` | Shared secret between Node.js backend and Python AI service |
| `OPENAI_API_KEY` | OpenAI key used by the AI service for classification, BCIO mapping, and recommendations |
| `REDIS_URL` | Redis connection URL (default `redis://localhost:6379`) |
| `RECAPTCHA_SITEKEY` / `RECAPTCHA_SECRETKEY` | Google reCAPTCHA keys |
| `MAIL_USER` / `MAIL_PASS` | Mailjet API credentials |
| `ADMIN_PASSWORD` | Apache Fuseki admin password |
| `LLM_MODEL` | OpenAI model name (e.g. `gpt-4o-mini`) |
| `LLM_TEMPERATURE` | Sampling temperature (0.0–1.0) |

---

## Production Deployment

See [DOCUMENTATION.md](DOCUMENTATION.md) for the full deployment guide.

1. Point DNS `habit.wiwi.tu-dresden.de → 141.76.16.16` and open ports 80 and 443.
2. Configure all secrets in Portainer's environment variables (do not commit real credentials).
3. Deploy via Portainer using the production Docker Compose file.
4. Traefik obtains a Let's Encrypt certificate automatically.

Production service endpoints (all behind Traefik HTTPS):

| Path | Service |
|---|---|
| `/` | Flutter web app |
| `/api/v1/` | Node.js backend |
| `/admin` | Next.js admin UI |
| `/fuseki` | Apache Fuseki SPARQL |
| `/mongo` | Mongo Express |
| `/dashboard` | Traefik dashboard |

**Neo4j Browser** is not publicly exposed; access via SSH tunnel:

```bash
ssh -L 7474:localhost:7474 -L 7687:localhost:7687 service@141.76.16.16
# then open http://localhost:7474
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Flutter 3, Dart, Keycloak PKCE |
| Backend | Node.js 22, Express, ES modules |
| Admin | Next.js, NextAuth.js |
| AI service | Python, FastAPI, OpenAI API |
| Databases | MongoDB, Neo4j 5, Apache Jena Fuseki |
| Cache / locks | Redis 7 |
| Identity | Keycloak 26 |
| Translation | LibreTranslate |
| Proxy / SSL | Traefik v3, Let's Encrypt |
| Infrastructure | Docker Compose, Portainer |

---

## Documentation

- [DOCUMENTATION.md](DOCUMENTATION.md) — architecture deep-dive, deployment, backup, troubleshooting
- [docs/guides/local-dev.md](docs/guides/local-dev.md) — step-by-step local dev setup
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment details

---

## Support

**Issues**: https://github.com/felixreinsch/health-habit-hub/issues  
**Contact**: felix.reinsch@tu-dresden.de

---

## License

Proprietary software for research purposes at TU Dresden.
