# Health Habit Hub — System Architecture

## Overview

Health Habit Hub (HHH) is a research platform for collecting, annotating, and recommending behavioural habits. It consists of ten Docker services orchestrated via `docker-compose`, a Flutter mobile/web app, and a Python-based recommender microservice. All HTTP traffic is routed through a Traefik reverse proxy.

---

## System Overview Diagram

```mermaid
graph TD
    Client["Browser / Flutter App"]

    subgraph Docker["Docker stack (h3-proxy network)"]
        Proxy["Traefik v3\n:80 (HTTP)\n:443 (HTTPS prod)\n:8080 dashboard"]

        App["Node.js Backend\n(Express)\n:3000\n/api/v1/*\n+ Flutter web static files"]

        Keycloak["Keycloak 24\n:8080\n/auth/realms/hhh"]

        Recommender["Python Recommender\n(FastAPI)\n:8000"]

        Fuseki["Apache Jena Fuseki\n:3030\nSPARQL endpoint"]

        Neo4j["Neo4j 5\n:7474 (HTTP)\n:7687 (Bolt)"]

        Mongo["MongoDB\n:27017"]

        MongoExpress["Mongo Express\n:8081\n/mongo admin UI"]

        LibreTranslate["LibreTranslate\n:5000\n/translate"]

        Backup["Backup Service\n(cron daily 02:00)"]
    end

    Client -->|"HTTPS :443 / HTTP :80"| Proxy
    Proxy -->|"Host: app.*"| App
    Proxy -->|"Host: keycloak.* / PathPrefix:/auth"| Keycloak
    Proxy -->|"Host: fuseki.*"| Fuseki
    Proxy -->|"PathPrefix:/mongo"| MongoExpress
    Proxy -->|"Host: translate.*"| LibreTranslate
    Proxy -->|"Host: neo4j.*"| Neo4j

    App -->|"Bearer JWT\nvalidation (JWKS)"| Keycloak
    App -->|"SPARQL queries\n(HTTP)"| Fuseki
    App -->|"Bolt protocol"| Neo4j
    App -->|"MongoDB driver\n:27017"| Mongo
    App -->|"HTTP /recommend"| Recommender

    Recommender -->|"Bolt protocol"| Neo4j

    Backup -->|"mongodump"| Mongo
    Backup -->|"tar fuseki-data"| Fuseki
    Backup -->|"neo4j-admin dump"| Neo4j
    Backup -->|"Keycloak REST API\n/partial-export"| Keycloak

    MongoExpress -->|"MongoDB driver"| Mongo
```

---

## Per-Service Reference Table

| Service | Technology | Purpose | Internal Port | External URL (dev) | Key Env Vars |
|---|---|---|---|---|---|
| **proxy** | Traefik v3.0 | Reverse proxy, TLS termination, routing | 8080 (dashboard) | `proxy.localhost:8888` | `TRAEFIK_HOST_PORT80`, `TRAEFIK_HOST_PORT8080`, `PATH_SUFFIX`, `ACME_EMAIL` (prod) |
| **app** | Node.js 20 + Express | REST API `/api/v1/*`; serves Flutter web static files from `/public/flutter/` | 3000 | `app.localhost:3000` | `MONGO_HOST`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `KEYCLOAK_URL`, `RECOMMENDER_URL`, `NODE_ENV` |
| **keycloak** | Keycloak 24 | OIDC/OAuth2 identity provider; manages realms, users, roles | 8080 | `localhost:8080` | `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KC_DB`, `KC_HTTP_RELATIVE_PATH` (prod) |
| **recommender** | Python + FastAPI | Habit recommendation engine; reads Neo4j graph | 8000 | `localhost:8000` | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` |
| **fuseki** | Apache Jena Fuseki | SPARQL triplestore; stores HHH + BCIO ontology | 3030 | `fuseki.localhost:3030` | `ADMIN_PASSWORD` |
| **neo4j** | Neo4j 5 (n10s plugin) | Graph database; stores habit graph with BCIO alignment | 7474 (HTTP), 7687 (Bolt) | `neo4j.localhost:7474` | `NEO4J_AUTH` (`user/password`), `NEO4J_PLUGINS` |
| **mongo** | MongoDB (latest) | Document store; holds survey results, profiles, annotations, admin settings | 27017 | Internal only | `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_INITDB_DATABASE` |
| **mongo-express** | Mongo Express | MongoDB admin web UI | 8081 | `localhost/mongo` | `ME_CONFIG_MONGODB_URL`, `ME_CONFIG_BASICAUTH_USERNAME`, `ME_CONFIG_BASICAUTH_PASSWORD` |
| **translate** | LibreTranslate | Self-hosted machine translation API (en/de/ja) | 5000 | `translate.localhost:5000` | `LT_LOAD_ONLY`, `LT_REQ_LIMIT` |
| **backup** | Custom Alpine + cron | Daily backups of MongoDB, Fuseki, Neo4j, Keycloak; 30-day retention | — | Internal only | `BACKUP_RETENTION_DAYS`, `ALERT_WEBHOOK_URL`, `BACKUP_EMAIL`, `MONGO_USER`, `MONGO_PASSWORD` |

> **Flutter web**: Not a separate Docker container. The Flutter app is compiled with `flutter build web` and the output is copied to `app/public/flutter/`. Traefik routes all traffic to the Node.js backend, which serves the static files.

---

## Sequence Diagrams

### 1. Keycloak PKCE Login Flow

```mermaid
sequenceDiagram
    participant Flutter
    participant Keycloak
    participant Backend as Node.js Backend

    Flutter->>Flutter: Generate code_verifier + code_challenge (S256)
    Flutter->>Keycloak: GET /auth/realms/hhh/protocol/openid-connect/auth<br/>?response_type=code&client_id=hhh-app<br/>&redirect_uri=...&code_challenge=...&code_challenge_method=S256
    Keycloak-->>Flutter: 302 redirect → login page
    Flutter->>Keycloak: POST /auth/realms/hhh/protocol/openid-connect/token<br/>grant_type=token (username + password or QR token)
    Keycloak-->>Flutter: { access_token, refresh_token, id_token }

    Note over Flutter: Store tokens in secure storage

    Flutter->>Backend: GET /api/v1/profile<br/>Authorization: Bearer <access_token>
    Backend->>Keycloak: GET /auth/realms/hhh/protocol/openid-connect/certs (JWKS)
    Keycloak-->>Backend: { keys: [...] }
    Backend->>Backend: Verify JWT signature + expiry + realm_access.roles
    Backend-->>Flutter: 200 { profile data }
```

### 2. Habit Donation Flow

```mermaid
sequenceDiagram
    participant Flutter
    participant Backend as Node.js Backend
    participant MongoDB
    participant Neo4j

    Flutter->>Backend: POST /api/v1/habits<br/>Authorization: Bearer <token><br/>{ description, category, context, ... }
    Backend->>Backend: Validate JWT (requireRole: participant)
    Backend->>Backend: Sanitize + rate-limit request
    Backend->>MongoDB: insertOne(habit_annotations collection)<br/>{ userId, description, category, deletedAt: null, ... }
    MongoDB-->>Backend: { insertedId }
    Backend->>Neo4j: CREATE (h:Habit { id, description, ... })<br/>-[:donates]->(donor)<br/>-[:hasBehavior]->(behavior)<br/>-[:hasContext]->(context)
    Neo4j-->>Backend: { nodes created }
    Backend-->>Flutter: 201 { habitId, message: "Habit donated" }
```

### 3. Recommendation Request Flow

```mermaid
sequenceDiagram
    participant Flutter
    participant Backend as Node.js Backend
    participant Recommender as Python Recommender
    participant Neo4j

    Flutter->>Backend: GET /api/v1/recommend<br/>Authorization: Bearer <token>
    Backend->>Backend: Validate JWT (requireRole: participant)
    Backend->>Recommender: GET http://recommender:8000/recommend<br/>{ userId, profile }
    Recommender->>Neo4j: MATCH (h:Habit)-[:hasBehavior]->(b:Behavior)<br/>WHERE NOT (h)<-[:donates]-(:Donor {id: $userId})<br/>RETURN h, b ORDER BY similarity DESC LIMIT 10
    Neo4j-->>Recommender: [{ habit, behavior, score }]
    Recommender->>Recommender: Rank by collaborative filter + BCIO category
    Recommender-->>Backend: { recommendations: [{ habitId, title, rationale, citation, score }] }
    Backend-->>Flutter: 200 { recommendations: [...] }
```

---

## Ontology

### Namespaces

| Prefix | URI | Description |
|---|---|---|
| `hhh:` | `http://example.com/hhh#` | HHH domain ontology (habits, donors, groups) |
| `bcio:` | `http://humanbehaviourchange.org/ontology/BCIO#` | Behaviour Change Intervention Ontology |
| `owl:` | `http://www.w3.org/2002/07/owl#` | OWL 2 Web Ontology Language |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` | RDF Schema |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | XML Schema Datatypes |

### HHH Core Classes

| Class | URI | Description |
|---|---|---|
| `hhh:Donor` | `hhh:Donor` | A study participant who donates habits |
| `hhh:Habit` | `hhh:Habit` | A donated habit instance |
| `hhh:Behavior` | `hhh:Behavior` | The action component of a habit |
| `hhh:Context` | `hhh:Context` | The situational trigger for a habit |
| `hhh:InternalState` | subclass of `Context` | Self-reported psychological state |
| `hhh:PhysicalSetting` | subclass of `Context` | Physical environment where habit occurs |
| `hhh:TimeReference` | subclass of `Context` | Time-based trigger |
| `hhh:People` | subclass of `Context` | Social context |
| `hhh:PriorBehavior` | subclass of `Context` | Preceding behaviour trigger |
| `hhh:Reasoning` | subclass of `Context` | Cognitive reasoning trigger |
| `hhh:ExperimentalSetting` | `hhh:ExperimentalSetting` | Study arm superclass (G1–G4) |

### BCIO Integration Point

The BCIO is merged inline into `fuseki/init/Ontology.ttl`. Key alignment points:

- `hhh:Behavior` → partial alignment with `bcio:BehaviourChangeTechnique` (HHH Behavior is user-reported action; BCIO BCT is an intervention technique)
- `hhh:Context` → partial alignment with `bcio:Setting` (HHH Context is the habit trigger; BCIO Setting is the intervention delivery environment)
- `hhh:InternalState` → possible alignment with `bcio:MechanismOfAction`

All alignments are marked `TODO: domain-review` in the ontology and should be validated by a domain expert before formal publication.

### G1–G4 Experimental Group Encoding

Participants are assigned to one of four study arms (ExperimentalSetting subclasses):

| Class | rdfs:comment | Description |
|---|---|---|
| `hhh:Group1` | Closed-Ended | Both task + general sections are closed-ended (structured questionnaire) |
| `hhh:Group2` | Closed-Ended Task, Opened-Ended General | Structured task section; free-text general section |
| `hhh:Group3` | Opened-Ended Task, Closed-Ended General | Free-text task section; structured general section |
| `hhh:Group4` | Opened-Ended | Both sections are free-text (minimal structure) |

After migration, query a specific group by label rather than comment:

### Example Cypher Queries (Neo4j)

**1. Find all habits donated by participants in Group 3:**

```cypher
MATCH (donor:Donor)-[:donates]->(habit:Habit)
WHERE donor.studyGroup = 'Group3'
RETURN donor.id AS donorId, habit.id AS habitId, habit.description AS description
ORDER BY donor.id, habit.id
```

**2. Find the top 5 most common behaviours across all habits:**

```cypher
MATCH (habit:Habit)-[:hasBehavior]->(behavior:Behavior)
RETURN behavior.label AS behaviour, count(habit) AS count
ORDER BY count DESC
LIMIT 5
```

### Example SPARQL Queries (Fuseki)

**1. List all HHH classes and their rdfs:comment:**

```sparql
PREFIX hhh: <http://example.com/hhh#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>

SELECT ?class ?label ?comment
WHERE {
  ?class a owl:Class .
  FILTER(STRSTARTS(STR(?class), "http://example.com/hhh#"))
  OPTIONAL { ?class rdfs:label ?label }
  OPTIONAL { ?class rdfs:comment ?comment }
}
ORDER BY ?class
```

**2. Find all BCIO classes included in the ontology:**

```sparql
PREFIX bcio: <http://humanbehaviourchange.org/ontology/BCIO#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  FILTER(STRSTARTS(STR(?class), "http://humanbehaviourchange.org/ontology/BCIO#"))
  OPTIONAL { ?class rdfs:label ?label }
}
ORDER BY ?class
```

---

*Generated: 2026-03-15 | Branch: ralph/hhh-platform-unified*
