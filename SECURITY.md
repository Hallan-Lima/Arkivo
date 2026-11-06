# Security Policy

Arkivo stores company documentation and credentials for AI providers, so we take security seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's [private vulnerability reporting](../../security/advisories/new) instead, with:

- a description of the issue and its impact;
- steps to reproduce (or a proof of concept);
- the affected version or commit.

We aim to acknowledge reports within 3 business days and to ship a fix as fast as possible, crediting you if you wish.

## Hardening checklist for self-hosting

- Set a long random `JWT_SECRET` (it also derives the key that encrypts stored API keys and SMTP passwords).
- Serve Arkivo over HTTPS (`NODE_ENV=production` enables secure cookies).
- Keep PostgreSQL and Gotenberg on a private network; do not expose ports `5433` and `3001`.
- Give MCP tokens the least privilege (read-only unless proposals are needed) and revoke unused ones.
