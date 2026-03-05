# Support

## Documentation

- Installation Guide: [`docs/INSTALL.md`](docs/INSTALL.md)
- API Reference: See `README.md` Tools section
- Configuration: `openclaw.plugin.json` schema

## Common Issues

| Symptom | Likely Cause | Fix |
| ------- | ------------ | --- |
| `docs.index_status()` shows `vector: false` | Qdrant unreachable or collection not created | Check Qdrant container, ensure `vectorSize` matches model dimensions |
| Zero search results for a query | Embedding endpoint down or model not loaded | Verify LM Studio is running and model is loaded; test with `curl http://192.168.0.11:1234/v1/embeddings` |
| FTS error `no such column: ...` | Query contains hyphens or reserved words | Plugin sanitizes; if persists, file an issue |
| Slow indexing | Network rate limits or large docs | Consider using `type: local-dir` for faster local parsing |

## Getting Help

- **GitHub Issues**: For bugs, feature requests, and questions. Search before opening.
- **OpenClaw Discord**: `#plugins` channel for community support.
- **Documentation**: https://docs.openclaw.ai (future plugin section)

## Commercial Support

For enterprise deployments, custom integrations, or SLA-backed support, contact:

**OpenClaw Solutions**  
Email: support@openclaw.ai  
Website: https://openclaw.ai

We offer:
- On-premise installation assistance
- Performance tuning for large doc sets
- Custom plugin development
- Training and workshops

## Contributing

Found a bug or want to add a feature? See [CONTRIBUTING.md](CONTRIBUTING.md). We welcome community contributions!
