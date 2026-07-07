# OpinionMap: Complete Project Documentation & Interview Guide

## Part 1: Project Foundation & Overview

**The Problem:**
In today's fast-paced digital world, businesses and researchers struggle to keep up with the sheer volume of opinions, trends, and sentiments expressed across various social media platforms. Manual market research is slow, prone to bias, and fails to capture real-time shifts in public perception.

**The Solution:**
**OpinionMap** is an AI-powered, multi-agent market intelligence platform that autonomously scrapes, analyzes, and visualizes real-time sentiment and trends from across the web. Instead of relying on static keyword searches, OpinionMap deploys a swarm of specialized AI agents that collaboratively research topics, understand context, perform Retrieval-Augmented Generation (RAG), and compile comprehensive, human-readable market reports.

**Core Value Proposition:**
- **Automated Research:** Reduces days of manual social media analysis into a background task that takes minutes.
- **Deep Contextual Understanding:** Doesn't just count keywords; it uses LLMs to understand *why* people feel a certain way.
- **Actionable Insights:** Generates clean, structured PDF reports and real-time dashboard analytics ready for executive review.

---

## Part 2: In-Depth Tech Stack Breakdown

OpinionMap utilizes a modern, fully decoupled architecture designed for scalability and asynchronous processing.

### 1. Frontend (Client-Side)
- **Framework:** React.js (via Vite)
- **Language:** TypeScript for strict type safety and better developer experience.
- **State Management:** Zustand (lightweight, unopinionated state management) & React Context.
- **Styling:** Tailwind CSS for utility-first, highly responsive, and premium dark-mode UI design.
- **Routing:** React Router DOM for Single Page Application (SPA) navigation.
- **Data Fetching:** Axios with interceptors for seamless JWT authentication injection.

### 2. Backend (Server-Side)
- **Framework:** FastAPI (Python) - Chosen for its incredible speed, native asynchronous support, and automatic OpenAPI documentation.
- **Architecture:** Service-Oriented Architecture (SOA) with clear separation of routers, services, models, and AI agents.
- **Authentication:** JWT (JSON Web Tokens) with bcrypt password hashing.

### 3. Database & Storage Layer
- **Relational Database:** PostgreSQL (Hosted on Neon DB). Stores user data, workflow metadata, and finalized reports.
- **ORM:** SQLAlchemy (Async) with Alembic for database migrations.
- **Vector Database:** ChromaDB. Used to store and query high-dimensional embeddings of scraped social media data for the RAG pipeline.

### 4. Infrastructure & Deployment
- **Containerization:** Docker & Docker Compose for guaranteed environment consistency across local and production.
- **Backend Hosting:** Render (Docker Web Service).
- **Frontend Hosting:** Netlify.
- **Reverse Proxy / Web Server:** Nginx (used in Docker configurations for routing and SSL).

---

## Part 3: Deep Dive into the AI & Orchestration Layer

The true "brain" of OpinionMap is its AI orchestration layer, built using **LangGraph**. Unlike simple linear AI scripts, OpinionMap uses a State Graph where different AI "personas" collaborate, critique, and pass data to one another.

### The Agent Swarm:
1. **Research Agent:** Interfaces directly with external scrapers (Reddit, Twitter, YouTube). It gathers the raw, unstructured data based on user queries.
2. **Cleaning Agent:** Receives the raw data and strips away noise, HTML tags, spam, and irrelevant bot comments to ensure high data quality.
3. **NLP / Sentiment Agent:** Analyzes the cleaned text. It determines sentiment (Positive/Negative/Neutral), extracts trending keywords, and identifies core discussion topics.
4. **Insight Agent:** The "thinker." It looks at the aggregated sentiment and topics, querying the RAG system to draw high-level business conclusions.
5. **Reviewer Agent:** A critical quality-control step. It reviews the Insight Agent's output. If the insights are weak or hallucinated, it rejects the draft and forces the Insight Agent to rewrite it.
6. **Report Agent:** Takes the finalized, approved insights and formats them into a beautifully structured Markdown/PDF report.

### State Management:
LangGraph maintains a persistent `State` dictionary that tracks the workflow's progress, the current drafted text, the extracted metadata, and the review feedback loop.

---

## Part 4: Retrieval-Augmented Generation (RAG) Architecture

LLMs (like Google Gemini) have a context window limit and cannot inherently know about real-time, highly specific scraped data. OpinionMap solves this using RAG.

1. **Ingestion (Embedding):** When the Research Agent scrapes thousands of comments, this text is passed to an Embedding Model (e.g., HuggingFace `all-MiniLM-L6-v2`). The model converts the text into mathematical vectors (arrays of numbers).
2. **Storage:** These vectors are saved in **ChromaDB**, an open-source vector database optimized for incredibly fast similarity searches.
3. **Retrieval:** When the Insight Agent needs to write a report about "battery life," it converts that query into a vector and asks ChromaDB to find the most mathematically similar comments.
4. **Generation:** The retrieved, highly-relevant comments are injected into the LLM's prompt as context, forcing the AI to base its insights purely on the factual, scraped data rather than hallucinating.

---

## Part 5: Advanced Features & Deployment

- **Asynchronous Workflows:** AI research takes time. OpinionMap uses Python's `asyncio` and background tasks so users don't have to wait on a loading screen. Workflows process in the background while users navigate the dashboard.
- **Dynamic CORS & Security:** Fully configured CORS allows the decoupled React frontend (Netlify) to securely talk to the FastAPI backend (Render) without exposing the API to malicious third-party sites.
- **Role-Based Access Control (RBAC):** Admin vs. standard user routing, ensuring secure access to system analytics.

---

## Part 6: Scalability & Future Architecture

If asked how to scale this project for millions of users, you can discuss:
1. **Message Queues:** Replacing FastAPI `BackgroundTasks` with **Celery + Redis** or **RabbitMQ**. This allows the AI agent workflows to be distributed across multiple worker servers independently of the web API.
2. **Kubernetes (K8s):** Container orchestration to auto-scale the AI worker pods based on CPU load (since LLM API calls and embedding models are resource-heavy).
3. **Database Sharding:** Moving from a single Neon DB instance to a read-replica setup for high-traffic dashboards.

---

## Part 7: Interview Preparation Guide

### ATS-Friendly Resume Bullets

* **Full-Stack Development:** Engineered "OpinionMap," a production-ready, full-stack market intelligence platform using React (TypeScript), Tailwind CSS, and FastAPI (Python), deployed via Docker to Render and Netlify.
* **AI Orchestration:** Designed and implemented a multi-agent AI pipeline using LangGraph and Google Gemini, enabling autonomous data scraping, cleaning, and review loops for automated market research.
* **RAG & Vector Databases:** Integrated ChromaDB to build a Retrieval-Augmented Generation (RAG) architecture, efficiently embedding and querying thousands of scraped social media data points for context-aware AI insights.
* **System Architecture:** Architected a highly scalable, asynchronous backend using SQLAlchemy and PostgreSQL (Neon DB), implementing robust JWT authentication, background task processing, and RESTful API principles.

### Common Interview Questions & Answers

**Q1: Why did you choose FastAPI over Django or Flask?**
*Answer:* "FastAPI was the perfect fit because of its native support for asynchronous programming (`async/await`). Since OpinionMap heavily relies on making network calls to external APIs (like Reddit/YouTube and Google Gemini), an asynchronous framework prevents the server from blocking while waiting for those responses. Additionally, FastAPI's automatic generation of OpenAPI (Swagger) docs made testing the frontend-to-backend connection incredibly seamless."

**Q2: Can you explain how LangGraph improves your AI over a standard LLM call?**
*Answer:* "A standard LLM call is linear and prone to hallucinations or lazy outputs. By using LangGraph, I created a State Graph with specialized agents. For example, my 'Insight Agent' writes the report, but before it reaches the user, it is passed to a 'Reviewer Agent'. If the Reviewer detects low-quality analysis, it triggers a cyclical loop, forcing a rewrite. This multi-agent collaboration drastically improves the reliability and quality of the final output."

**Q3: How does your RAG implementation work?**
*Answer:* "Instead of passing raw, massive blocks of scraped text directly into the LLM (which is expensive and often exceeds token limits), I chunk the scraped data and use an embedding model to convert the text into vector representations. These are stored in ChromaDB. When the AI needs to generate insights, it performs a semantic similarity search in ChromaDB to retrieve only the most highly relevant comments, injecting them as context into the prompt."

**Q4: How did you handle long-running AI tasks so the user experience doesn't freeze?**
*Answer:* "Initially, standard HTTP requests would timeout because AI workflows take minutes. I solved this by decoupling the architecture. When a user requests a new report, the backend instantly returns a `202 Accepted` status and hands the actual LangGraph orchestration off to a FastAPI `BackgroundTask`. On the frontend, the user sees the workflow status as 'Processing' and can navigate the dashboard freely while the backend works asynchronously."

**Q5: What was the hardest bug you faced during deployment and how did you solve it?**
*Answer:* "When migrating from local Docker to Render, the application crashed silently on startup. I had to debug the deployment environment variables and realized the asynchronous PostgreSQL driver (`asyncpg`) strictly requires the connection string parameter `ssl=require`, whereas standard Postgres uses `sslmode=require`. Tracking down this driver-specific syntax error taught me a lot about production database configurations."
