# Security Policy

## Supported Versions

As this is an early project, we provide security updates for the latest release only. Please use the current `master` branch.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

We take security issues seriously. If you discover a vulnerability, please report it privately.

**DO NOT** open a public GitHub issue for security problems.

Instead, email: **opensource@openclaw.ai**

Include:
- A description of the vulnerability
- Steps to reproduce
- Any relevant logs or snippets
- Suggested fix if you have one

We will acknowledge receipt within 48 hours and provide a timeline for a fix. We aim to resolve critical issues within 7 days.

## Security Considerations for Deployments

- **API Keys**: Never commit LM Studio or Qdrant credentials. Use environment variables or OpenClaw config with restricted file permissions.
- **Network**: The plugin calls out to LM Studio (embeddings) and Qdrant (vectors). Ensure these endpoints are not exposed to the public internet unless behind authentication.
- **Input Sanitization**: The plugin uses parameterized FTS queries to avoid SQLite injection. Still, avoid allowing untrusted users to execute arbitrary `docs.search` with complex SQL fragments.
- **Data Retention**: Indexed documentation is stored in plaintext in SQLite and Qdrant. Treat these directories as sensitive if docs contain proprietary information.
- **Update Dependencies**: Run `npm audit` periodically and update dependencies, especially `better-sqlite3`, `node-fetch`, and `cheerio`.

## Acknowledgments

We appreciate responsible disclosure and will credit contributors who help improve security (with permission).
