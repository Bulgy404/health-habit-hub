# Environment configuration

The repository-root `.env.example` is the configuration template. Copy it to `.env` for local development and replace the required placeholders for the services you use. `.env` contains private credentials and is ignored by Git. Never copy its actual passwords, keys, or service-account JSON into documentation or the template.

Both files use the same section order. A commented assignment (`# NAME=value`) is inactive. A blank optional value usually disables its integration; it is different from an obsolete setting.

## Find a setting

| Section | Purpose |
| --- | --- |
| Local test accounts | Portal administrator, test researcher, and seeded-participant fixture settings |
| Deployment and routing | Production domains/TLS, local hostnames and proxy ports |
| Backend and internal services | Application addresses, internal API secrets, audio storage and cache settings |
| Local development switches | Test tools and recovery-phrase visibility; keep disabled in production |
| Admin portal | NextAuth session secret and operator-only tool links |
| Keycloak and authentication | Master administrator, client credentials and token validation |
| Databases and cache | MongoDB, Neo4j and Redis connections |
| AI models and speech input | Provider credentials, model selection, fallback and speech-to-text |
| Embeddings and ontology mapping | Embedding provider, model, dimensions and mapping thresholds |
| LightRAG knowledge base | Internal API access and separate operator WebUI login |
| Translation | Backend translation address and LibreTranslate image settings |
| Push notifications | Server Firebase service-account JSON |
| Email and alerts | SMTP transport and alert recipients |
| Backups | Internal backup API, retention, upload limit and optional offsite sync |
| Operator monitoring and tool access | Grafana and admin-only dashboard SSO |
| Optional integrations | PostHog/analytics VM and Sentry, disabled until configured |
| Optional verified-identity register | Separate identity service, credentials, mail and backup settings |
| Inactive / legacy | Archived variables with no current application reader |

The identity register is still supported. It needs its own Compose profile and setup; it is not an obsolete feature. Similarly, blank PostHog, Sentry or offsite-backup settings do not mean those integrations have been removed.

## Local test logins

| Account | Username setting | Password setting | Provisioning |
| --- | --- | --- | --- |
| Portal administrator | `HHH_ADMIN_USER` | `KEYCLOAK_ADMIN_PASSWORD` | Local `keycloak-init` service |
| Test researcher | `HHH_RESEARCHER_USER` | `HHH_RESEARCHER_PASSWORD` | `make dev` or `make seed-researcher` |
| Keycloak master administrator | `KEYCLOAK_ADMIN` | `KEYCLOAK_ADMIN_PASSWORD` | Local Keycloak startup |

The example researcher username is `testresearcher`. Choose a password in your private `.env`; the template deliberately leaves it blank, which skips researcher provisioning. The setup script records `HHH_RESEARCHER_ID` automatically to identify the account on subsequent runs. Do not copy that ID to a different installation.

After the local services are running, provision or reset only the researcher with:

```bash
make seed-researcher
```

Open [the local portal](http://admin.localhost/admin) in a private window to test the researcher while retaining an administrator session. The researcher has no initial study memberships and no admin or infrastructure roles. They can create a study; the operator can also assign an existing study. See [Researcher access](researcher-access.md) for permissions and verification steps.

These local fixtures are separate from participant accounts created by `make seed-user`. That command prints the participant credentials; no fixed `testuser` account is created by the baseline seed script.

## Inactive / legacy settings

These entries remain commented at the bottom of both environment files so their old values are available for reference:

| Archived variable | Replacement / current behavior |
| --- | --- |
| `GRAPH_BACKEND` | The application uses Neo4j. The old Fuseki/Neo4j selector has no application reader; production Compose already defaults it to `neo4j`. |
| `FIREBASE_ANDROID_API_KEY` | Root `.env` is not read for Flutter Firebase configuration. See `mobile/lib/firebase_options.dart`. |
| `FIREBASE_IOS_API_KEY` | Same as Android: maintain the mobile Firebase configuration rather than reactivating a root variable. |

`FIREBASE_SERVICE_ACCOUNT_JSON` is **still active**: the backend uses it for push notifications. `LT_*` variables are **still active** too: the external LibreTranslate image reads them even when application source files do not reference them. Monitoring, database, SSO and LightRAG secrets remain necessary for the operator even though researchers cannot use those tools.

## Change settings without mixing environments

- Keep the original quoting around values, especially JSON and values containing `#` or spaces.
- Preserve interpolation dependencies: for example, define `REDIS_PASSWORD` before `REDIS_URL` and the translation address before its `LT_*` aliases.
- Use `docker-compose.local.yml` for local services. Production uses `docker-compose.yml`, `stack.env` and the deployment's Portainer environment values.
- Rebuild the admin image when changing `NEXT_PUBLIC_*` values: they are embedded during the frontend build.
- Recreate affected containers when changing their runtime environment. Editing `.env` does not update a running container.
- Reordering comments and archiving the three unused root variables does not require a restart by itself. No credentials were rotated by that cleanup.

To validate local Compose configuration without displaying expanded secrets:

```bash
docker compose -f docker-compose.local.yml config --quiet
```

See [Local development](local-dev.md) for startup and [Deployment](../../DEPLOYMENT.md) for production configuration. The private `.env` is not a substitute for the server's Portainer secrets.
