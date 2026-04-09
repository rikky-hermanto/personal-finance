# Personal Finance Platform

An automated, cross-bank personal finance tracker that ingests bank statements (CSV, PDF, Images), normalizes the data, and provides a unified dashboard. Built as a scalable alternative to tedious manual spreadsheet tracking.

## 🚀 The Problem It Solves

Managing personal finance across multiple bank accounts is a nightmare because **every bank has a different statement format**. You might download a CSV from one bank, a PDF from another, or even just take a screenshot of your balance history on a neo-bank app.

If you hate manual data entry like I do, you're stuck doing manual AI conversions every month: copy-pasting data to ChatGPT and manually massaging CSVs. 

This project **automates the entire pipeline**:
1. **Upload** any bank statement (CSV, PDF, Screenshot).
2. **AI Extractor** standardizes the data using Bank Profiles and LLMs (Anthropic/OpenAI) equipped with state-of-the-art unstructured data extraction.
3. **Database** saves all your normalized data using EF Core and PostgreSQL.
4. **Dashboard** visualizes your true multi-bank cash flowchart. 

## 🛠️ Tech Stack

- **Backend:** .NET 9 Web API (C# 13), MediatR, Entity Framework Core 9
- **AI Service:** Python 3.12, FastAPI, LangChain, PyMuPDF
- **Frontend:** React 18, TypeScript, Tailwind CSS, TanStack Query
- **Database:** PostgreSQL 16 + pgvector (for future RAG/natural language querying)
- **Infrastructure:** Docker Compose

---

## 🏃 Getting Started

### Prerequisites
- Docker Engine (with Docker Compose)
- Node.js 20+
- .NET 9 SDK
- PowerShell (Windows) or standard bash (Linux/Mac)

### 1. Configure the Environment
Clone the repository, then copy the `.env.example` file to create your own configuration.

```bash
cp .env.example .env
```

Open `.env` and configure your database password.
```env
# Example .env configuration
VITE_API_URL=http://localhost:7208
POSTGRES_DB=personal_finance
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
```

### 2. Run the Application
The project includes a convenient script that will launch the PostgreSQL database, the .NET Web API Backend, and the React Frontend simultaneously. 

#### On Windows (PowerShell)
```powershell
./start-all.ps1
```

#### Via npm
```bash
npm start
```
*Note: Ensure Docker is running before executing these commands!*

---

## 💡 Usage Quickstart

1. Navigate to **http://localhost:8080** to see your main dashboard.
2. The Backend API swagger is available at **http://localhost:7208/swagger**.
3. Head over to **Settings -> Bank Profiles** to ensure configurations for banks (BCA, Superbank, Wise, etc.) meet your expectations.
4. Go to **Import**, and upload your CSV, PDF, or screenshot statements. The system will automatically infer the appropriate extractor, normalize outputs securely into PostgreSQL, and update your master Cash Flow dashboard.

## 🏗 Roadmap & Learning Goals
This project serves as a comprehensive system showcasing Document AI handling and Multi-Agent Orchestration. Future sprints include:
- Generating dynamic embeddings on transactions
- Adding Natural Language querying *(e.g., "Show me all Wise transport transactions above $150 in the last 3 months")* via RAG.
- Auto-categorization optimizations.
