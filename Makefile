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

test: ## Run backend tests
	cd backend && pytest tests/ -v --tb=short

test-cov: ## Run tests with coverage
	cd backend && pytest tests/ -v --cov=app --cov-report=html --cov-report=term-missing

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

format: ## Format backend code
	cd backend && black . && isort .

lint: ## Lint backend code
	cd backend && ruff check . && mypy app/

monitoring: ## Start monitoring stack
	docker-compose up -d prometheus grafana mlflow
