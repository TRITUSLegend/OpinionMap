# OpinionMap: The Ultimate Technical Deep Dive

This document is written specifically for someone without prior backend experience. It explains exactly *how* the underlying technologies in OpinionMap work, step-by-step, using simple analogies and detailed technical breakdowns.

---

## 1. What is an API, and How Does It Actually Work?

### The Restaurant Analogy
Imagine you are sitting at a table in a restaurant (the **Frontend** / React App). You want food, but you can't just walk into the kitchen (the **Database** / Server) and start cooking. Instead, you look at a menu and give your order to the waiter (the **API**). The waiter takes your order to the kitchen, waits for the chef to cook it, and brings the food back to your table.

**API stands for Application Programming Interface.** It is the middleman that allows two pieces of software to talk to each other. In OpinionMap, the React frontend uses an API to ask the backend for data.

### How do they talk? (HTTP Methods & JSON)
When the frontend talks to the backend, it sends a "Request" using HTTP (the language of the web). There are different types of requests:
* **GET Request:** "Waiter, can I see the menu?" (Fetching a list of generated reports).
* **POST Request:** "Waiter, I want to order a burger." (Creating a new workflow to analyze a topic).
* **DELETE Request:** "Waiter, cancel my order!" (Deleting a report).

The data they pass back and forth is written in **JSON** (JavaScript Object Notation). It looks like a simple text dictionary. For example, when you ask the backend for a user's details, it replies with:
```json
{
  "name": "Aditya",
  "email": "aditya@example.com",
  "role": "admin"
}
```

---

## 2. How Does FastAPI Work?

OpinionMap's backend is built using **FastAPI**, a modern Python framework for building APIs. 

### Why is it called "Fast"? (Asynchronous Programming)
In older Python frameworks (like Django or Flask), the server operates **synchronously**. If 10 people ask the server to download a YouTube video, the server downloads Person 1's video, waits 5 minutes, then downloads Person 2's, etc. 

FastAPI is **asynchronous** (`async` and `await`). When Person 1 asks for a video, FastAPI says, "Okay, start downloading that. While we wait for it to finish, what does Person 2 need?" It can juggle thousands of requests at the exact same time without freezing. This is absolutely critical for OpinionMap because calling AI models (like Gemini) takes time. We don't want the server to freeze while waiting for the AI to think.

### Routers and Endpoints
FastAPI organizes code into **Endpoints**. An endpoint is just a specific URL that triggers a specific Python function.
For example, in OpinionMap, we have code that looks like this:
```python
@app.post("/api/workflows/")
async def create_workflow(query: str):
    # Code to start the AI research goes here
    return {"message": "Workflow started!"}
```
If your frontend sends a POST request to `https://opinionmap.com/api/workflows/`, FastAPI automatically triggers that exact Python function.

### Pydantic (Data Validation)
FastAPI uses a tool called **Pydantic**. If a user tries to create an account but sends their age as `"banana"` instead of a number, Pydantic automatically catches the error and rejects the request before it even hits your database, preventing catastrophic crashes.

---

## 3. What is RAG (Retrieval-Augmented Generation)?

RAG is arguably the most important concept in modern AI applications. 

### The Problem with standard LLMs
Large Language Models (like ChatGPT or Gemini) have read the whole internet, but their knowledge is frozen in time. Furthermore, if you ask an LLM, "What is the sentiment regarding the iPhone 16 on Twitter today?", it will either hallucinate (make up a lie) or say "I don't have access to real-time data."

### The RAG Solution
**Retrieval-Augmented Generation** fixes this by giving the AI an open-book test. Instead of asking the AI to rely on its memory, we retrieve the exact facts, hand them to the AI, and say, "Answer the question using *only* this document."

### Step-by-Step RAG in OpinionMap:
1. **Scraping:** OpinionMap's code physically goes to Reddit/Twitter and downloads 1,000 recent comments about the iPhone 16.
2. **Embeddings (Math Magic):** AI doesn't understand English; it understands numbers. We pass all 1,000 comments through an "Embedding Model". This model converts every sentence into a massive array of numbers (e.g., `[0.12, -0.55, 0.98...]`). Sentences that mean the same thing get placed close together in a mathematical 3D space.
3. **Vector Database (ChromaDB):** We save all these arrays of numbers in **ChromaDB**. ChromaDB is a special database built specifically to store and quickly search these number arrays (vectors).
4. **The Search:** When we want to generate a report on "battery life", we convert the phrase "battery life" into numbers, and ask ChromaDB: "Find me the vectors closest to this one." ChromaDB instantly returns the 50 Reddit comments talking about battery issues.
5. **Generation:** We send a prompt to Gemini that says: *"Here are 50 real Reddit comments: [insert comments]. Based ONLY on these comments, write a report about the iPhone 16's battery life."* 

Because the AI is generating text augmented by the data we retrieved, we call it **Retrieval-Augmented Generation**.

---

## 4. LangGraph & The Multi-Agent Swarm

OpinionMap doesn't just use one AI prompt; it uses a **Graph** of AIs.

### Standard AI vs Agents
A standard AI answers a question and stops. An **AI Agent** is an AI that has been given tools (like the ability to search the web, run Python code, or use calculators) and the autonomy to decide *when* to use them.

### What is LangGraph?
LangGraph is a framework for connecting multiple AI Agents together into a flowchart (a Graph). In a graph, you have **Nodes** (the agents doing the work) and **Edges** (the conditional logic connecting them).

### The OpinionMap Flow:
1. **Node 1 (Research Agent):** Uses code to scrape Reddit. Passes data to Node 2.
2. **Node 2 (Cleaning Agent):** An AI specifically prompted to remove spam, links, and emojis from the raw data. Passes data to Node 3.
3. **Node 3 (Insight Agent):** Uses RAG to write a business report based on the clean data. 
4. **The Conditional Edge (Reviewer Agent):** The report is passed to a strict Reviewer Agent. The Reviewer reads it and scores it. 
   * **If Score < 80:** The Reviewer routes the graph *backwards* to Node 3, providing critique ("You hallucinated this statistic, rewrite it.").
   * **If Score >= 80:** The graph moves forward to the Report Agent to generate the PDF.

LangGraph ensures that the AI double-checks its own work before the human ever sees it.

---

## 5. What are Grafana & Prometheus?

When you run a large system in production, you need to know if it's healthy. If the app crashes at 3:00 AM, you need to know why.

### Prometheus (The Scraper)
Prometheus is a time-series database. Every 15 seconds, Prometheus knocks on FastAPI's door (via the `/metrics` endpoint) and asks for statistics: "How much CPU are you using? How many users logged in? How many API requests failed? How many tokens did the LLM consume?" It stores this data over time.

### Grafana (The Visualizer)
Prometheus just holds raw numbers. **Grafana** is a dashboard tool that connects to Prometheus and turns those raw numbers into beautiful, real-time line charts, pie charts, and heatmaps. 
* *Example Use Case:* If your cloud bill suddenly spikes, you can look at Grafana and see exactly which AI agent is consuming the most tokens per minute.

---

## 6. How Authentication (JWT) Works

When you log into OpinionMap, your password is mathematically scrambled (hashed using **bcrypt**) before it is saved in the Neon database. Even if a hacker steals the database, they just see random gibberish, not your password.

When you successfully type your password, the server generates a **JWT (JSON Web Token)**. 
* A JWT is essentially a digital wristband that says "This person is Aditya, and this wristband is valid for the next 24 hours."
* The server gives this token to your React frontend.
* Every time your React frontend clicks a button (like "Delete Report"), it attaches this token to the API request. 
* FastAPI looks at the token, verifies the cryptographic signature to ensure it wasn't forged, and then allows the action. If the 24 hours have passed, the token expires, and you are forced to log in again.
