<div align="center">

<img src="apps/web/public/favicon.svg" width="72" alt="Logo do Arkivo" />

# Arkivo

### Orquestrador de documentação open source e self-hosted para empresas, com IA que propõe e pessoas que aprovam

**Traga a documentação antiga (Word, PDF, PowerPoint, Excel), organize por área, mantenha tudo vivo com versionamento, responsáveis e prazos de revisão, e use qualquer IA (nuvem ou local) para responder dúvidas e sugerir atualizações.**

[![Licença: AGPL v3](https://img.shields.io/badge/licen%C3%A7a-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?logo=typescript&logoColor=white)](#tecnologias)
[![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ed?logo=docker&logoColor=white)](#como-rodar)
[![PRs welcome](https://img.shields.io/badge/PRs-bem--vindos-brightgreen.svg)](CONTRIBUTING.md)

[Funcionalidades](#funcionalidades) · [Como rodar](#como-rodar) · [Roadmap](#roadmap) · [Contribuir](CONTRIBUTING.md) · [🇺🇸 English](README.md)

</div>

---

> **Uma alternativa open source ao Confluence, com a importação de que as empresas realmente precisam.**
> Nasceu para times de TI (procedimentos, runbooks, SQL, infraestrutura) e foi pensado para crescer para todos os departamentos: RH, Financeiro, Operações e outros.

## Por que o Arkivo?

Nas empresas, a documentação está espalhada em arquivos Word, PDFs, pastas de rede, wikis antigas e na cabeça das pessoas. As wikis tradicionais pressupõem que você comece do zero, e a documentação fica desatualizada porque ninguém é dono dela.

O Arkivo se apoia em três ideias:

1. **Legado em primeiro lugar.** Arraste centenas de `.docx`, `.pdf`, `.pptx`, `.xlsx`, `.doc`, `.rtf`, `.md` e `.html`. Eles viram páginas editáveis, e **o original é guardado e exibido exatamente como era**.
2. **A IA propõe, a pessoa aprova.** A IA (ou qualquer agente via MCP) nunca altera uma página publicada direto. Ela abre uma **proposta com diff lado a lado**, e um editor aceita ou rejeita.
3. **Documento com dono e prazo de validade.** Cada página tem status, responsável e data de revisão. As vencidas aparecem numa fila de revisões.

## Funcionalidades

- **Espaços** por área, com **árvore de páginas** (arrastar e soltar)
- **Editor em blocos** com comandos `/`: títulos, listas, checklists, tabelas, imagens, código e **SQL com realce de sintaxe**
- **Salvamento automático** e **histórico de versões**, com **comparação no estilo VS Code** (lado a lado, apenas alterações ou conteúdo completo) e restauração
- **Governança**: status, responsável, prazo de revisão e tela de **Revisões**
- **Importação** de Word, PowerPoint, PDF, Excel, CSV, Markdown, HTML, TXT, scripts e imagens; formatos legados (`.doc`, `.ppt`, `.xls`, `.odt`, `.rtf`) via LibreOffice/Gotenberg
- **Visualização do original**: cada página importada mostra o arquivo de origem com o layout idêntico (PDF renderizado, com zoom)
- **IA opcional**, configurada pelo administrador: OpenAI, Anthropic, Ollama (local) ou qualquer API compatível com OpenAI
- **Chat no painel lateral** (estilo ChatGPT), com fontes citadas, e **modo Editar**, que gera propostas com diff
- **Servidor MCP** para conectar Claude, Cursor, Copilot e agentes próprios
- **Usuários e papéis** (Administrador, Editor, Leitor), convites, redefinição e troca de senha, SMTP
- Busca full-text (`Ctrl+K`), tema claro e escuro

## Como rodar

**Pré-requisitos:** Node.js 22+ e Docker.

```bash
git clone https://github.com/<seu-usuario>/arkivo.git
cd arkivo
npm install
cp .env.example apps/server/.env      # defina um JWT_SECRET longo e aleatório
npm run infra:up                      # PostgreSQL (pgvector) + Gotenberg
npm run dev                           # API em :3000 e web em :5173
```

Acesse **http://localhost:5173**. No primeiro acesso, o Arkivo pede para criar a empresa e o administrador. IA, e-mail e tokens MCP são configurados em **Administração**.

## Tecnologias

100% **TypeScript**: React 19, Vite, Tailwind CSS v4, Tiptap, NestJS (Fastify), Kysely, PostgreSQL + pgvector, Vercel AI SDK, SDK oficial do MCP, pdf.js e Gotenberg (LibreOffice).

## Roadmap

- [x] Espaços, árvore, editor, versões com diff, busca
- [x] Usuários, papéis, convites, senhas, SMTP
- [x] Chat com IA e propostas de alteração com aprovação humana
- [x] Importação de legado com visualização fiel do original
- [x] Servidor MCP com tokens
- [ ] Processos e diagramas (BPMN, draw.io, Excalidraw, Mermaid)
- [ ] Boards de cards (Kanban)
- [ ] Documentação SQL com leitura automática de schema (somente leitura) e dicionário de dados
- [ ] Fluxo de aprovação de publicação, avisos por e-mail, busca semântica, OCR, SSO, colaboração em tempo real

## Contribuindo

Toda contribuição é bem-vinda. Veja o [CONTRIBUTING.md](CONTRIBUTING.md). Se o projeto for útil para você, **deixe uma ⭐**: isso ajuda outras pessoas a encontrá-lo.

## Licença

[GNU AGPL-3.0](LICENSE).
