<div align="center">

<img src="apps/web/public/favicon.svg" width="72" alt="Arkivo logo" />

# Arkivo

### Open-source, self-hosted documentation hub for companies, with AI that proposes changes and humans who approve them

**Bring in your old documentation (Word, PDF, PowerPoint, Excel), organize it by team, keep it alive with versioning, owners and review dates, and let any AI (cloud or local) answer questions and suggest updates.**

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?logo=typescript&logoColor=white)](#tech-stack)
[![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ed?logo=docker&logoColor=white)](#quick-start)
[![MCP](https://img.shields.io/badge/MCP-server-8b5cf6)](#mcp-server-connect-your-ai-agents)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#features) · [Quick start](#quick-start) · [AI](#ai-any-provider-including-100-local) · [MCP](#mcp-server-connect-your-ai-agents) · [Roadmap](#roadmap) · [Contributing](CONTRIBUTING.md) · [🇧🇷 Português](README.pt-BR.md)

</div>

---

> **An open-source alternative to Confluence, with the import power companies actually need.**
> Arkivo was born in IT teams (runbooks, SQL, infrastructure, procedures) and is designed to scale to every department: HR, Finance, Operations and beyond.

<!--
  📸 Screenshots: add images to docs/screenshots/ and uncomment.
  Repos with screenshots in the README get far more stars and visits.
  <p align="center"><img src="docs/screenshots/editor.png" width="900" alt="Arkivo editor with AI chat side panel" /></p>
-->

## Why Arkivo?

Most companies have documentation scattered across Word files, PDFs, shared drives, old wikis and people's heads. Wikis assume you start from scratch, and documentation rots because nobody owns it.

Arkivo is built around three ideas:

1. **Legacy first.** Drag in hundreds of old `.docx`, `.pdf`, `.pptx`, `.xlsx`, `.doc`, `.rtf`, `.md` and `.html` files. They become editable pages, and **the original is kept and shown pixel-perfect** next to them.
2. **AI proposes, humans approve.** AI (or any agent via MCP) never edits a published page directly. It opens a **change proposal with a side-by-side diff**, and an editor accepts or rejects it.
3. **Documentation with an owner and an expiry date.** Every page has a status, an owner and a review deadline. Overdue pages show up in a review queue.

## Features

### ✍️ Writing and organization
- **Spaces** per team or department, each with a **page tree** (drag-and-drop to reorganize)
- **Block editor** (Notion-like) with `/` commands: headings, lists, checklists, tables, quotes, images, code blocks and **SQL blocks with syntax highlighting**
- **Autosave** and **full version history**: named versions, restore any version, and a **VS Code-style diff** (side-by-side, changes only, or full content)
- **Governance**: status (Draft → In review → Published → Outdated), owner, review deadline, overdue alerts and a **Reviews** queue
- **Full-text search** with prefix matching and highlighted snippets (`Ctrl+K` command palette)
- Light and dark themes, clean UI

### 📥 Import legacy documentation
- Word (`.docx`, with images), PowerPoint (`.pptx`), PDF, Excel (`.xlsx`), CSV, Markdown, HTML, TXT, scripts (`.sql`, `.sh`, `.ps1`, `.py`, `.yaml`…) and images
- Legacy formats (`.doc`, `.ppt`, `.xls`, `.odt`, `.rtf`…) through LibreOffice ([Gotenberg](https://gotenberg.dev))
- **Preview before importing**, with editable titles and a choice of destination space, parent page and status
- **Original view**: every imported page keeps its source file and shows it **exactly as it was** (rendered PDF of the original layout, with zoom), one click away from the editable version

### 🤖 AI: any provider, including 100% local
- Enabled and configured by the admin: **OpenAI**, **Anthropic (Claude)**, **Ollama** (local), or **any OpenAI-compatible API** (LM Studio, vLLM, OpenRouter, Azure, Groq…)
- **Chat panel** on every page (ChatGPT-style) that answers from your documentation and **cites its sources**
- **"Edit" mode**: ask for a change, and the AI generates a **proposal with a diff** for human review
- Company-wide instructions (tone, glossary, writing standards)
- API keys are **encrypted at rest** (AES-256-GCM); with a local model, **no data ever leaves your network**

### 🔌 MCP server: connect your AI agents
- Built-in **[Model Context Protocol](https://modelcontextprotocol.io) server** (Streamable HTTP) at `/api/mcp`
- Works with Claude, Cursor, Copilot and custom agents
- Tools: `list_spaces`, `list_pages`, `search_docs`, `read_page`, `propose_change`, `create_page_draft`
- Per-token permissions (read-only, or read + propose). Every write goes through human approval

### 👥 Users and administration
- Roles: **Admin**, **Editor**, **Viewer**
- Invite by email or shareable link, password reset, change password, deactivate users
- Admin area: general settings, users, AI, email (SMTP) and integrations (MCP tokens)

## Quick start

**Requirements:** Node.js 22+ and Docker.

```bash
git clone https://github.com/<your-user>/arkivo.git
cd arkivo
npm install
cp .env.example apps/server/.env      # set a long random JWT_SECRET
npm run infra:up                      # PostgreSQL (pgvector) + Gotenberg
npm run dev                           # API on :3000, web app on :5173
```

Open **http://localhost:5173**. On first access, Arkivo asks you to create your company and the admin account.

| Service | Purpose | Port |
|---|---|---|
| `web` | React app | 5173 |
| `server` | REST API, MCP server, AI, import | 3000 |
| `postgres` | Data, full-text search, pgvector | 5433 |
| `gotenberg` *(optional)* | Office → PDF for pixel-perfect previews and legacy formats | 3001 |

### Configuration (`apps/server/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random secret for sessions; it also derives the encryption key for stored secrets |
| `PUBLIC_URL` | Public URL used in emails (invites, password reset) |
| `STORAGE_DIR` | Folder for uploaded files (default `./data/uploads`) |
| `GOTENBERG_URL` | Gotenberg endpoint; leave empty to disable Office previews |

AI, SMTP and MCP tokens are configured in the web UI under **Administration**.

## Connecting an AI agent via MCP

Create a token in **Administration → Integrations (MCP)**, then add this to your MCP client:

```json
{
  "mcpServers": {
    "arkivo": {
      "type": "http",
      "url": "https://docs.your-company.com/api/mcp",
      "headers": { "Authorization": "Bearer ark_..." }
    }
  }
}
```

## Tech stack

100% **TypeScript**, built on proven open-source building blocks:

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, TanStack Query, Radix UI, cmdk |
| Editor | [Tiptap](https://tiptap.dev) (ProseMirror), lowlight |
| Backend | [NestJS](https://nestjs.com) on Fastify, [Kysely](https://kysely.dev) |
| Database | PostgreSQL 17 + pgvector |
| AI | [Vercel AI SDK](https://ai-sdk.dev) (OpenAI, Anthropic, OpenAI-compatible) |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Import | mammoth (DOCX), unpdf/pdf.js (PDF), ExcelJS, marked, JSZip, Gotenberg (LibreOffice) |

```
apps/
  server/          NestJS API: auth, users, spaces, nodes, versions, AI, import, MCP
  web/             React app: editor, chat, import, admin
docker-compose.yml PostgreSQL + Gotenberg
```

## Roadmap

- [x] Spaces, page tree, block editor, versions with diff, search
- [x] Users, roles, invites, password reset, SMTP
- [x] AI chat with sources, and AI change proposals with human approval
- [x] Legacy import with pixel-perfect original view
- [x] MCP server with scoped API tokens
- [ ] **Processes and diagrams**: BPMN/flowcharts, draw.io, Excalidraw, Mermaid
- [ ] **Boards**: Kanban cards linked to documents
- [ ] **SQL documentation**: read-only schema sync (PostgreSQL, SQL Server, MySQL, Oracle) and data dictionary
- [ ] Publishing workflow (draft → review → publish) with approvers
- [ ] Email reminders for overdue reviews
- [ ] Semantic search (pgvector embeddings) for better AI answers
- [ ] OCR for scanned PDFs, and Confluence export (`.zip`) import
- [ ] SSO (OIDC / SAML / LDAP / Active Directory)
- [ ] Real-time collaboration (Yjs)
- [ ] Per-space permissions and department templates
- [ ] Official Docker image and one-command production deploy

Have an idea? [Open an issue](../../issues), all suggestions are welcome.

## Contributing

Contributions of all sizes are welcome: bug reports, translations, docs, features. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

If Arkivo is useful to you, **please give it a ⭐**. It helps other people find the project.

## License

[GNU AGPL-3.0](LICENSE). You are free to use, modify and self-host Arkivo, including commercially. If you offer a modified version as a network service, you must publish your changes under the same license.

<sub>Keywords: open-source Confluence alternative, self-hosted wiki, knowledge base, documentation platform, internal docs, IT documentation, runbooks, SOP, AI documentation assistant, RAG, MCP server, Ollama, document import, Word to wiki, PDF to wiki, document management, TypeScript, NestJS, React, Tiptap.</sub>
