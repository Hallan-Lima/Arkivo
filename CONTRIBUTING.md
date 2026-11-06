# Contributing to Arkivo

Thanks for your interest! Contributions of every size are welcome: bug reports, ideas, docs, translations and code.
*Contribuições em português também são muito bem-vindas.*

## Ways to help

- ⭐ Star the repo and share it with people who struggle with scattered documentation
- 🐛 [Report a bug](../../issues/new?template=bug_report.yml)
- 💡 [Suggest a feature](../../issues/new?template=feature_request.yml)
- 📝 Improve the docs or translate the UI
- 🧑‍💻 Pick an issue labeled `good first issue` or `help wanted`

## Development setup

```bash
npm install
cp .env.example apps/server/.env
npm run infra:up      # PostgreSQL + Gotenberg (Docker)
npm run dev           # API :3000 + web :5173
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Runs API and web in watch mode |
| `npm run typecheck` | Type-checks every workspace |
| `npm run build` | Production build of server and web |

Database migrations live in `apps/server/src/database/migrations` and run automatically when the API starts. To add one, create a new numbered file and register it in `migrate.ts`.

## Pull requests

1. Fork the repo and create a branch: `feat/short-description` or `fix/short-description`.
2. Keep PRs focused; one change per PR is easier to review.
3. Make sure `npm run typecheck` and `npm run build` pass.
4. Describe **what** changed and **why**, with screenshots for UI changes.
5. We use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`…).

## Code style

- TypeScript everywhere, `strict` mode.
- Prefer existing libraries and patterns already used in the codebase.
- UI text is currently in Portuguese (pt-BR); i18n is on the roadmap.

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
