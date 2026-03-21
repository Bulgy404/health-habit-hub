# Health Habit Hub

<img src="./app/public/pics/h3-logo.png" width="250" alt="Health Habit Hub Logo"/>

**Production URL**: https://habit.wiwi.tu-dresden.de
**Version**: 1.0.0 (October 2025)

A research-focused web application for collecting and analyzing health habit data using a 2×2 experimental design with multi-database architecture.

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/health-habit-hub.git
cd health-habit-hub

# Configure environment
cp .env.example .env

# Start development environment
docker-compose up -d --build

# Access application
open http://localhost
```

---

## Key Features

- **Experimental Design**: 2×2 factorial design for habit data collection
- **Multi-Database**: Apache Fuseki (RDF), Neo4j (Graph), MongoDB (Documents)
- **Multi-Language**: English, German, Japanese (i18n)
- **Automated Backups**: Daily backups with 14-day retention
- **Production-Ready**: Docker Compose with automatic SSL via Let's Encrypt
- **Translation API**: Integrated LibreTranslate for multilingual content

---

## Architecture

```
Internet (80/443) → Traefik (SSL) → Node.js App → Databases
                                          ├── Apache Fuseki (RDF)
                                          ├── Neo4j (Graph)
                                          ├── MongoDB (Documents)
                                          └── LibreTranslate (API)
```

**Services**:
- **app**: Node.js/Express application
- **fuseki**: Apache Jena Fuseki (RDF triple store)
- **neo4j**: Neo4j graph database
- **mongo**: MongoDB document store
- **translate**: LibreTranslate API
- **proxy**: Traefik reverse proxy
- **backup**: Automated backup service

---

## Documentation

**Complete documentation available in [DOCUMENTATION.md](DOCUMENTATION.md)**

### Quick Links

- [Quick Start Guide](DOCUMENTATION.md#quick-start)
- [Architecture & Design](DOCUMENTATION.md#architecture--design)
- [Development Guide](DOCUMENTATION.md#development-guide)
- [Production Deployment](DOCUMENTATION.md#production-deployment)
- [Backup System](DOCUMENTATION.md#backup-system)
- [Testing](DOCUMENTATION.md#testing)
- [User Manual](DOCUMENTATION.md#user-manual)
- [Troubleshooting](DOCUMENTATION.md#troubleshooting)
- [API Reference](DOCUMENTATION.md#api-reference)

---

## Local Development

```bash
# Start with hot-reload
docker-compose watch

# View logs
docker-compose logs -f

# Run tests
cd app && npm test

# Code quality
npm run lint
npm run format
```

---

## Backend (Node.js/Express)

The backend lives in `app/`. It is an ES-module Node.js 22 + Express application.

### npm Scripts

| Script | Description |
|---|---|
| `npm test` | Run all unit + integration tests with Jest (requires no live services — all injected via factory pattern) |
| `npm run lint` | ESLint check (`eslint .`) |
| `npm run format` | Prettier write (`prettier --write .`) |
| `npm run format:check` | Prettier check (CI mode) |
| `node app.js` | Start the server directly |

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Express listen port |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j Bolt connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password` | Neo4j password |
| `MONGO_URL` | `mongodb://mongo:27017` | MongoDB connection string |
| `MONGO_DB` | `hhh` | MongoDB database name |
| `KEYCLOAK_JWKS_URL` | — | Full URL to Keycloak JWKS endpoint (e.g. `http://keycloak:8080/realms/hhh/protocol/openid-connect/certs`) |
| `KEYCLOAK_URL` | `http://keycloak:8080` | Keycloak base URL (used by onboard and admin routes) |
| `KEYCLOAK_REALM` | `hhh` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | `hhh-flutter` | Public client ID for participant token exchange |
| `KEYCLOAK_ADMIN_CLIENT_ID` | `hhh-backend` | Confidential client ID for admin operations |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | — | Secret for the `hhh-backend` confidential client |
| `API_SERVICE_URL` | `http://recommender:8000` | URL of the Python API-service (recommender + LLM endpoints) |
| `LIBRE_TRANSLATE_URL` | — | Full URL to LibreTranslate `/translate` endpoint. If absent, falls back to `http://{TRANSLATE_HOST}:{TRANSLATE_PORT}{TRANSLATE_PATH}` |
| `TRANSLATE_HOST` | `localhost` | LibreTranslate host (fallback if `LIBRE_TRANSLATE_URL` not set) |
| `TRANSLATE_PORT` | `5000` | LibreTranslate port (fallback) |
| `TRANSLATE_PATH` | `/translate` | LibreTranslate path (fallback) |
| `RECOMMENDER_URL` | `http://recommender:8000` | URL of the Python recommender service for the `/recommend` proxy |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL for recommendation result caching |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limiter window in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Maximum requests per window per user |

**Access**:
- App: http://localhost
- Traefik: http://localhost:8080
- Fuseki: http://localhost/fuseki
- Neo4j: http://localhost/neo4j

---

## Production Deployment

See [Production Deployment Guide](DOCUMENTATION.md#production-deployment) for complete instructions.

**Quick deployment**:
1. Configure DNS: `habit.wiwi.tu-dresden.de → 141.76.16.16`
2. Open firewall ports: 80, 443
3. Configure `.env` with production credentials
4. Deploy via Portainer with `docker-compose.prod.yml`
5. Verify SSL certificate obtained automatically

**Production URL**: https://habit.wiwi.tu-dresden.de

### Accessing Databases in Production

**Neo4j Browser** (requires SSH tunnel):
```bash
# Create secure tunnel to Neo4j
ssh -L 7474:localhost:7474 -L 7687:localhost:7687 service@141.76.16.16

# Then access: http://localhost:7474
# Login with Neo4j credentials (username: neo4j, password from NEO4J_PASSWORD)
```

See [DEPLOYMENT.md - Neo4j SSH Tunnel](DEPLOYMENT.md#accessing-neo4j-browser-via-ssh-tunnel) for detailed instructions.

**Other services** (available via https://habit.wiwi.tu-dresden.de):
- Mongo Express: `/mongo`
- Fuseki RDF: `/fuseki`
- Traefik Dashboard: `/dashboard`

---

## Tech Stack

**Backend**: Node.js 22, Express.js (JSON API)
**Frontend**: Flutter 3.22 (web, Android, iOS)
**Databases**: Apache Fuseki (RDF), Neo4j, MongoDB
**Infrastructure**: Docker, Traefik, Let's Encrypt
**Tools**: LibreTranslate, reCAPTCHA, Mailjet

---

## Requirements

- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum (8GB recommended)
- Ports 80, 443 (production)

---

## Support

**Documentation**: [DOCUMENTATION.md](DOCUMENTATION.md)
**Issues**: https://github.com/felixreinsch/health-habit-hub/issues
**Contact**: felix.reinsch@tu-dresden.de

---

## License

Proprietary software for research purposes at TU Dresden.

**Contact**: felix.reinsch@tu-dresden.de
