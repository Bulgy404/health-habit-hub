.DEFAULT_GOAL := help

.PHONY: help dev stop seed logs logs-all ios reset test test-backend test-flutter test-python test-admin

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Start all local services (docker compose local up)
	docker compose -f docker-compose.local.yml up -d

stop: ## Stop all local services
	docker compose -f docker-compose.local.yml down

seed: ## Seed MongoDB, Neo4j, and Keycloak with local dev data
	cd app && npm run seed

logs: ## Tail app service logs
	docker compose -f docker-compose.local.yml logs -f app

logs-all: ## Tail all service logs
	docker compose -f docker-compose.local.yml logs -f

ios: ## Run the Flutter app on an iPhone Simulator
	cd mobile && flutter run -d iPhone

reset: stop ## Stop services, wipe volumes, restart, and re-seed
	docker compose -f docker-compose.local.yml down -v
	$(MAKE) dev
	$(MAKE) seed

test: test-backend test-flutter test-python test-admin ## Run all unit tests (no Docker required)

test-backend: ## Backend: lint + unit tests + security audit
	cd app && npx prettier --check . && npx eslint . && \
	node --test "tests/unit/**/*.test.js" && \
	npm audit --audit-level=critical

test-flutter: ## Flutter: analyze + widget/unit tests
	cd mobile && flutter analyze lib/ test/ && flutter test

test-python: ## Python API-service: pytest
	cd API-service && pytest tests/ -v

test-admin: ## Admin: typecheck
	cd admin && npx tsc --noEmit
