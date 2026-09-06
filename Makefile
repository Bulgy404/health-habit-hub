.DEFAULT_GOAL := help

.PHONY: help \
        dev stop seed seed-user verify-keycloak fix-keycloak logs logs-all ios reset \
        monitoring monitoring-stop logs-prometheus logs-grafana \
        format test test-backend test-identity test-flutter test-python test-admin test-alert-email seed-habits \
        prod-up prod-stop prod-ps prod-logs prod-build prod-restart \
        prod-keycloak prod-seed prod-update prod-cutover

# ── Local development ─────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

dev: ## Start local services (docker-compose.local.yml)
	docker compose -f docker-compose.local.yml up -d --build

stop: ## Stop local services
	docker compose -f docker-compose.local.yml down

seed: ## Seed local MongoDB, Neo4j, Keycloak, and Neo4j community habit graph
	set -a && . ./.env && set +a && export KEYCLOAK_URL=http://localhost:8080 && cd app && npm run seed
	$(MAKE) verify-keycloak || ( $(MAKE) fix-keycloak && $(MAKE) verify-keycloak )
	$(MAKE) seed-habits MODE=e2e
	$(MAKE) seed-user

seed-user: ## Seed QA test participant(s) with rich history (COUNT=1-5, default 1 — see scripts/seed-test-user.js)
	set -a && . ./.env && set +a && export KEYCLOAK_URL=http://localhost:8080 && node scripts/seed-test-user.js

verify-keycloak: ## Verify hhh-flutter default scopes include stable identity claims (sub)
	bash scripts/verify-keycloak-claims.sh

fix-keycloak: ## Auto-fix missing required default scopes for hhh-flutter in local Keycloak
	bash scripts/verify-keycloak-claims.sh --fix

logs: ## Tail local app logs
	docker compose -f docker-compose.local.yml logs -f app

logs-all: ## Tail all local service logs
	docker compose -f docker-compose.local.yml logs -f

ios: ## Run Flutter app on iPhone Simulator (run 'make dev' first)
	cd mobile && flutter run -d iPhone \
		--dart-define=API_BASE_URL=http://localhost:3000/api/v1 \
		--dart-define=KEYCLOAK_URL=http://localhost:8080 \
		--dart-define=WS_BASE_URL=ws://localhost:3000/ws

reset: stop ## Wipe local volumes, restart, and re-seed
	docker compose -f docker-compose.local.yml down -v
	$(MAKE) dev
	$(MAKE) seed

monitoring: ## Start Prometheus + Grafana (grafana.localhost / prometheus.localhost)
	docker compose -f docker-compose.local.yml up -d prometheus grafana

monitoring-stop: ## Stop Prometheus + Grafana
	docker compose -f docker-compose.local.yml stop prometheus grafana

logs-prometheus: ## Tail Prometheus logs
	docker compose -f docker-compose.local.yml logs -f prometheus

logs-grafana: ## Tail Grafana logs
	docker compose -f docker-compose.local.yml logs -f grafana

test: test-backend test-identity test-flutter test-python test-admin ## Run all tests

format: ## Auto-format backend code with Prettier
	cd app && npx prettier --write .

test-backend: format ## Backend: lint + unit tests + security audit
	# --test-force-exit: at this file count, node --test's default child-process
	# reaping intermittently never detects the last file(s) in the (internally
	# re-sorted, alphabetical) queue as complete, hanging the whole run even
	# though every test already passed — reproduced on Node 26.0.0 independent
	# of --test-concurrency (1, 4, and the CPU-count default all hang some of
	# the time). force-exit sidesteps it by exiting once all tests + hooks have
	# reported, instead of waiting for the event loop to drain naturally.
	cd app && npx prettier --check . && npx eslint . && \
	node --test --test-force-exit "tests/unit/**/*.test.js" "tests/integration/**/*.test.js" && \
	npm audit --audit-level=critical

test-identity: ## Identity register: unit tests + security audit
	@echo "==> Identity service"
	cd identity-service && npm test && npm audit --audit-level=high

test-flutter: ## Flutter: analyze + widget/unit tests
	cd mobile && flutter analyze lib/ test/ && flutter test

test-python: ## Python API-service: pytest (prefers API-service/.venv if present)
	# Prefer the project venv's interpreter — a bare `python3` often resolves to
	# a Homebrew Python without the test deps (pytest), which fails the target
	# even though the venv is set up. Falls back to python3 when no venv exists.
	set -a && . ./.env && set +a && cd API-service && \
	PY=$$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3) && \
	$$PY -m pytest tests/ -v

test-admin: ## Admin: typecheck
	cd admin && npx tsc --noEmit

test-alert-email: ## Send one real test alert email via the configured SMTP relay (manual only, never runs from `make test`)
	set -a && . ./.env && set +a && python3 scripts/send-test-alert.py

seed-habits: ## Seed Neo4j with 100 test habits via full donation pipeline (MODE=seed for fast direct path)
	python3 -m pip install --quiet --break-system-packages httpx neo4j
	set -a && [ -f ./$(or $(ENV_FILE),.env) ] && . ./$(or $(ENV_FILE),.env); set +a; \
	NEO4J_URI=$(or $(NEO4J_URI),bolt://localhost:7687) python3 scripts/seed-habits.py --mode $(or $(MODE),e2e) --concurrency $(or $(CONCURRENCY),5)

# ── Production (run on server) ────────────────────────────
# All prod targets use docker-compose.yml (the default file).
# Run these from ~/Github/health-habit-hub-v2 on the server.

prod-up: ## Build images and start the production stack
	docker compose up -d --build

prod-stop: ## Stop production stack (data is preserved in volumes)
	docker compose down

prod-ps: ## Show production container status
	docker compose ps

prod-logs: ## Tail production logs  (optionally: make prod-logs SERVICE=app)
	docker compose logs -f $(SERVICE)

prod-build: ## Rebuild production images without restarting containers
	docker compose build

prod-restart: ## Restart all production services
	docker compose restart

prod-update: ## Pull latest code and redeploy (rolling update)
	git pull
	docker compose up -d --build

prod-keycloak: ## Import realm, align secrets, grant service-account permissions
	@KEYCLOAK_URL=https://$$(grep '^DOMAIN=' .env | cut -d= -f2-)/auth \
	KEYCLOAK_ADMIN_PASSWORD=$$(grep '^KEYCLOAK_ADMIN_PASSWORD=' .env | cut -d= -f2-) \
	KEYCLOAK_ADMIN_CLIENT_SECRET=$$(grep '^KEYCLOAK_ADMIN_CLIENT_SECRET=' .env | cut -d= -f2-) \
	bash scripts/deploy-keycloak.sh

prod-seed: ## Seed MongoDB and Neo4j baseline data via Docker (run once after first deploy)
	docker run --rm \
	  --network hhh-proxy \
	  --env-file .env \
	  -v $(CURDIR)/app:/workspace/app \
	  -v hhh-seed-modules:/workspace/app/node_modules \
	  -v $(CURDIR)/scripts:/workspace/scripts \
	  -e MONGO_HOST=mongo \
	  -e NEO4J_HTTP=http://neo4j:7474 \
	  -w /workspace/app \
	  node:20-alpine \
	  sh -c "npm install --omit=dev --silent && node /workspace/scripts/seed-local.js"

prod-cutover: ## Switch HTTP from port 18080 → 80 after old stack is stopped
	@sed -i 's/^TRAEFIK_HTTP_PORT=.*/TRAEFIK_HTTP_PORT=80/' .env
	docker compose up -d proxy
	@echo "Done. HTTP traffic now redirects to HTTPS on $$(grep '^DOMAIN=' .env | cut -d= -f2-)."
