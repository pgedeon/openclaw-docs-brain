# Contributing to Docs-Brain

Thank you for considering a contribution! This document outlines the process and expectations.

## Code of Conduct

All contributors must abide by the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, inclusive, and constructive.

## Getting Started

1. **Fork the repo** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/openclaw-docs-brain.git
   cd openclaw-docs-brain
   ```
3. **Install dependencies**: `npm ci --only=production`
4. **Set up environment**:
   - LM Studio running with an embedding model
   - Qdrant instance (Docker: `docker run -p 6333:6333 qdrant/qdrant`)
   - Copy plugin to an OpenClaw workspace for integration testing

## Development Workflow

- Create a feature branch: `git checkout -b feature/your-feature`
- Make changes. Keep code simple and well-commented.
- Ensure the plugin loads in OpenClaw (`openclaw plugins list`).
- Add tests for new functionality (update existing `test-*.mjs` or create new ones).
- Run existing tests: `node test-hybrid.mjs` (requires Qdrant + LM Studio)
- Commit with clear messages: `git commit -m "feat: add X"` or `fix: resolve Y`
- Push and open a Pull Request against `master`.

## Commit Conventions

We use Conventional Commits:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `test:` add/adjust tests
- `chore:` maintenance (no production impact)

## Pull Request Guidelines

- PR description should explain the problem, solution, and any breaking changes.
- Include screenshots or logs if relevant.
- Keep PRs focused; avoid bundled unrelated changes.
- CI (if configured) must pass.

## Adding New Sources

To add a new documentation source:

1. Update `sources.yaml` with `id`, `url`, `title`, `type`.
2. Run reindex: `node reindex.mjs` or `docs.reindex(['new-id'])`.
3. Verify search quality: `node test-hybrid.mjs` or custom query script.
4. Document the source in `README.md` if it becomes a default example.

## Coding Standards

- Use ES2022+ features; avoid cargo-culting.
- Prefer `const`/`let` over `var`.
- Handle errors with `try/catch` and log with `[docs-brain]` prefix.
- Keep functions small and testable.

## Questions?

Open an issue for discussion before large changes.

---

OpenClaw community — let's build better docs search together.
