.DEFAULT_GOAL := help

.PHONY: help dev stop seed logs logs-all ios reset

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
