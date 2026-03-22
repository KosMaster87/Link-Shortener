# 🔗 Link Shortener with Analytics

> **KI Coding Mastery – 30-Day Project**
> A web app that turns long URLs into short links, tracks every click, and displays statistics in a dashboard.

---

## 🎯 What does this project do?

- **Shorten URLs** – Long links are converted into compact short URLs
- **Track clicks** – Every visit is stored with timestamp, referrer, and device info
- **Analytics Dashboard** – Overview of click counts, traffic sources, and time-based distribution

---

## 🛠️ Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Runtime  | Node.js (ESM, `"type": "module"`) |
| Database | PostgreSQL                        |
| API      | REST (HTTP)                       |
| Frontend | HTML / CSS / Vanilla JS           |

---

## 📁 Project Structure

```text
link-shortener/
├── server.js            # HTTP server entry point
├── src/
│   ├── routes/          # Route handlers (HTTP layer)
│   │   ├── links.js     # GET /api/links, POST /api/links, DELETE /api/links/:code
│   │   ├── redirect.js  # GET /:code (redirect)
│   │   └── analytics.js # GET /api/links/:code/clicks
│   ├── services/        # Business logic
│   │   ├── link-service.js
│   │   └── analytics-service.js
│   ├── db/              # Database
│   │   ├── schema.sql   # CREATE TABLE statements
│   │   └── index.js     # pg Pool setup
│   └── utils/
│       └── result.js    # ok() / err() helpers
├── public/              # Static frontend files
├── package.json
└── README.md
```

> Structure grows with the course – extended daily.

---

## 🚀 Quick Start

```bash
# Install dependencies (once available)
npm install

# Start development server
npm start
```

Requirements:

- Node.js ≥ 20
- PostgreSQL (local or Docker) – see [Day 2 setup](https://nodejs.org)

---

## 📅 Course Progress

| Day   | Topic                                    | Status |
| ----- | ---------------------------------------- | ------ |
| Day 0 | Setup & Project Definition               | ✅     |
| Day 1 | CLAUDE.md & Project Configuration        | ✅     |
| Day 2 | Architecture, Database & Server Skeleton | ✅     |
| Day 3 | First Feature: URL Shortening            | ✅     |
| Day 4 | Iteration & Refactoring                  | ✅     |
| Day 5 | Feature #2: TDD with Analytics Service   | ✅     |
| ...   | ...                                      | ...    |

---

## 👨‍💻 Developer

**Konstantin Aksenov**
🔗 [GitHub](https://github.com/KosMaster87) · 📧 [Konstantin.Aksenov@dev2k.org](mailto:Konstantin.Aksenov@dev2k.org)
