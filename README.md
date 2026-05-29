<div align="center">

# OpinionMap

### Multi-Agent Market Intelligence Platform

[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

*Production-grade AI platform that orchestrates intelligent agents to gather, analyze, and deliver real-time market intelligence from multiple data sources.*

---

[**Features**](#-features) · [**Quick Start**](#-quick-start) · [**Architecture**](#-architecture) · [**API Docs**](#-api-documentation) · [**Contributing**](#-contributing)

</div>

---

## About

**OpinionMap** is a production-grade, multi-agent market intelligence platform that leverages cutting-edge AI orchestration to provide comprehensive market analysis. Built with **LangGraph** for sophisticated agent workflow management and powered by **Google Gemini**, the platform autonomously scrapes, processes, and analyzes data from YouTube, Reddit, news outlets, and more.

The platform employs **Retrieval-Augmented Generation (RAG)** with ChromaDB for contextual analysis, ensuring insights are grounded in real data. A beautiful **React + TypeScript** dashboard provides interactive visualizations, while **MLflow** tracks experiment performance and **Prometheus + Grafana** deliver enterprise-grade observability.

Whether you're tracking competitor movements, analyzing market sentiment, or discovering emerging trends — OpinionMap provides the intelligence you need, when you need it.

---

## Screenshots

<div align="center">

> *Screenshots coming soon — the dashboard features interactive charts, real-time agent monitoring, and comprehensive market analysis views.*

</div>

---

## Features

- 🤖 **Multi-Agent Orchestration** — LangGraph-powered agent workflows with dynamic task routing and parallel execution
- 📊 **Real-Time Market Intelligence** — Continuous monitoring of YouTube, Reddit, news, and social media sources
- 🧠 **RAG-Powered Analysis** — ChromaDB vector storage with context-aware retrieval for grounded insights
- 🎨 **Interactive Dashboard** — React + TypeScript UI with real-time data visualization and workflow management
- 🔄 **Workflow Management** — Create, monitor, and control complex multi-agent analysis pipelines
- 📈 **Comprehensive Monitoring** — Prometheus metrics, Grafana dashboards, and MLflow experiment tracking
- 🔐 **Enterprise Security** — JWT authentication, rate limiting, CORS, and security headers
- 🐳 **One-Command Deployment** — Full Docker Compose stack with health checks and auto-restart

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| **Backend** | Python 3.11 · FastAPI · SQLAlchemy · Alembic · Pydantic |
| **Frontend** | React 18 · TypeScript · Vite · TanStack Query · Recharts |
| **AI / ML** | Google Gemini · LangGraph · LangChain · ChromaDB (RAG) |
| **Database** | PostgreSQL 16 · ChromaDB (Vector Store) |
| **Monitoring** | Prometheus · Grafana · MLflow · Structured Logging |
| **DevOps** | Docker · Docker Compose · Nginx · GitHub Actions · Makefile |

---

## Architecture

```mermaid
graph TB
    subgraph Client
        UI[React Dashboard]
    end

    subgraph Proxy
        NG[Nginx Reverse Proxy]
    end

    subgraph Backend
        API[FastAPI Server]
        AUTH[Auth Middleware]
        WF[Workflow Engine]
    end

    subgraph AI Engine
        LG[LangGraph Orchestrator]
        YTA[YouTube Agent]
        RDA[Reddit Agent]
        NWA[News Agent]
        ANA[Analysis Agent]
    end

    subgraph Data Layer
        PG[(PostgreSQL)]
        CR[(ChromaDB)]
        GEM[Google Gemini API]
    end

    subgraph Monitoring
        PROM[Prometheus]
        GRAF[Grafana]
        MLF[MLflow]
    end

    subgraph External Sources
        YT[YouTube API]
        RD[Reddit API]
        NW[News Sources]
    end

    UI --> NG
    NG --> API
    API --> AUTH
    API --> WF
    WF --> LG
    LG --> YTA & RDA & NWA & ANA
    YTA --> YT
    RDA --> RD
    NWA --> NW
    ANA --> GEM
    ANA --> CR
    API --> PG
    LG --> CR
    API --> PROM
    PROM --> GRAF
    LG --> MLF

    style UI fill:#61DAFB,stroke:#333,color:#000
    style NG fill:#009639,stroke:#333,color:#fff
    style API fill:#009688,stroke:#333,color:#fff
    style LG fill:#6C63FF,stroke:#333,color:#fff
    style PG fill:#4169E1,stroke:#333,color:#fff
    style CR fill:#FF6B6B,stroke:#333,color:#fff
    style GEM fill:#4285F4,stroke:#333,color:#fff
    style PROM fill:#E6522C,stroke:#333,color:#fff
    style GRAF fill:#F46800,stroke:#333,color:#fff
    style MLF fill:#0194E2,stroke:#333,color:#fff
```

---

## Quick Start

### Prerequisites
- **Docker** and **Docker Compose**
- **Git**

### 1. Environment Setup
```bash
# Clone the repository (if you haven't already)
git clone https://github.com/yourusername/OpinionMap.git
cd OpinionMap

# Copy the environment file
cp .env.example .env

# IMPORTANT: Edit .env and securely generate new passwords and JWT keys!
```

### 2. SSL Certificates
The platform is secured with HTTPS by default. Generate self-signed certs (or place your real domain certs in `nginx/ssl/`):
```bash
docker run --rm -v $(pwd)/nginx/ssl:/ssl alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -subj "/C=US/ST=State/L=City/O=OpinionMap/CN=localhost"
```

### 3. Deploy
Deploy the entire secure stack using Docker Compose:
```bash
docker compose up -d --build
```
Your secure deployment will now be running and accessible at `https://localhost` (or your public domain).

### Local Development (Using Make)

```bash
make setup    # Initial setup
make dev      # Start development environment
make test     # Run tests
make logs     # Follow Docker logs
```

---

## API Documentation

OpinionMap provides interactive API documentation:

- **Swagger UI**: `/docs` (Available when running locally at `http://localhost:8000/docs`)
- **ReDoc**: `/redoc` (Available when running locally at `http://localhost:8000/redoc`)

### Key Endpoints

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/auth/login` | Authenticate and receive JWT token |
| `GET` | `/api/workflows` | List all workflows |
| `POST` | `/api/workflows` | Create a new analysis workflow |
| `GET` | `/api/workflows/{id}` | Get workflow status and results |
| `POST` | `/api/agents/execute` | Trigger agent execution |
| `GET` | `/api/intelligence/reports` | Retrieve analysis reports |
| `GET` | `/api/monitoring/metrics` | Prometheus metrics endpoint |
| `GET` | `/api/health` | Health check |

---

## Project Structure

```
OpinionMap/
├── backend/                    # FastAPI Backend
│   ├── alembic/               # Database migrations
│   │   ├── versions/          # Migration files
│   │   ├── env.py             # Alembic environment config
│   │   └── script.py.mako     # Migration template
│   ├── app/
│   │   ├── agents/            # LangGraph agent definitions
│   │   ├── api/               # API route handlers
│   │   ├── core/              # Config, security, dependencies
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   ├── database.py        # Database connection setup
│   │   └── main.py            # FastAPI application entry
│   ├── tests/                 # Backend test suite
│   ├── alembic.ini            # Alembic configuration
│   ├── Dockerfile             # Backend container
│   └── requirements.txt       # Python dependencies
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API client services
│   │   ├── stores/            # State management
│   │   └── types/             # TypeScript type definitions
│   ├── Dockerfile             # Frontend container
│   ├── nginx.conf             # Frontend Nginx config
│   └── package.json           # Node dependencies
├── monitoring/                 # Observability Stack
│   ├── grafana/
│   │   └── dashboards/        # Grafana dashboard configs
│   ├── mlflow/
│   │   └── Dockerfile         # MLflow server container
│   └── prometheus/
│       └── prometheus.yml     # Prometheus scrape config
├── nginx/                      # Reverse Proxy
│   └── nginx.conf             # Main Nginx configuration
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # GitHub Actions pipeline
├── .env.example               # Environment variable template
├── .gitignore                 # Git ignore rules
├── docker-compose.yml         # Docker Compose orchestration
├── Makefile                   # Development commands
└── README.md                  # This file
```

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Guidelines

- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Write tests for new features
- Run `make format` and `make lint` before committing
- Update documentation as needed

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by the OpinionMap Team**

[⬆ Back to Top](#-OpinionMap-ai)

</div>
