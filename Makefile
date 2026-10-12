.PHONY: dev build up down test clean migrate logs format lint setup help

# ============================================
# AgentFlow AI - Development Commands
# ============================================

help: ## Show this help message
	@echo "AgentFlow AI - Available Commands:"
	@echo "──────────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Initial project setup
	cp -n .env.example .env || true
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev: ## Start development environment
	docker-compose up -d postgres chromadb
	cd backend && uvicorn app.main:app --reload --port 8000 &
	cd frontend && npm run dev

build: ## Build all Docker images
	docker-compose build

up: ## Start all services in background
	docker-compose up -d

down: ## Stop all services
	docker-compose down

test: ## Run backend tests (auth suite, throwaway SQLite database)
	cd backend && python -m pytest

test-cov: ## Run tests with coverage (pytest-cov not configured)
	@echo "Note: pytest-cov is not in requirements.txt. Install it manually and run: cd backend && pytest --cov=app"

clean: ## Stop services and clean artifacts
	docker-compose down -v
	rm -rf backend/__pycache__
	rm -rf backend/.pytest_cache
	rm -rf frontend/node_modules
	rm -rf frontend/dist

migrate: ## Run database migrations
	cd backend && alembic upgrade head

migrate-create: ## Create a new migration (usage: make migrate-create MSG="description")
	cd backend && alembic revision --autogenerate -m "$(MSG)"

logs: ## Follow all service logs
	docker-compose logs -f

logs-backend: ## Follow backend logs only
	docker-compose logs -f backend

format: ## Format backend code (black/isort not configured -- run manually if installed)
	@echo "Note: black and isort are not in requirements.txt. Install them manually to format."

lint: ## Lint backend code (ruff/mypy not configured -- run manually if installed)
	@echo "Note: ruff and mypy are not in requirements.txt. Install them manually to lint."

monitoring: ## Start monitoring stack
	docker-compose up -d prometheus grafana
