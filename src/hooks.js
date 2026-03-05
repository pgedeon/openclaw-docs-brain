export class Hooks {
  constructor(toolsHandler, searcher, indexer, config, api) {
    this.tools = toolsHandler;
    this.searcher = searcher;
    this.indexer = indexer;
    this.config = config;
    this.api = api;
  }

  async beforePromptBuild(event, ctx) {
    const agentId = ctx?.agentId;
    if (!agentId) return {};

    const injectAgents = this.config.injectAgents || [];
    const isInjected = injectAgents.includes(agentId);

    if (!isInjected) {
      return {};
    }

    const messages = [];

    // Always add tool-first guidance
    messages.push({
      role: 'system',
      content: `## Documentation Access Policy

You have access to documentation via the docs-brain plugin. Before making code changes:

1. Call \`docs.snippets_for_task\` with your task description and relevant file context.
2. Review the returned snippets to understand correct API usage and patterns.
3. Base your edits on the retrieved documentation.

Do not guess at APIs or parameters - always consult the docs first.

If you need to search for something specific, you can also call \`docs.search\` directly.`
    });

    // Optional auto-inject
    if (this.config.autoInject?.enabled) {
      const topK = this.config.autoInject.topK || 6;
      const maxChars = this.config.autoInject.maxChars || 3500;

      try {
        // Use the current user message as task text if available
        const userMsg = ctx.messages?.find(m => m.role === 'user');
        const taskText = userMsg?.content || 'general coding task';

        const snippets = await this.searcher.search(taskText, topK);
        if (snippets.length > 0) {
          let injected = `## Retrieved Documentation\n\n`;
          for (const snippet of snippets) {
            const entry = `- **${snippet.title}** (${snippet.source})\n  ${snippet.text.substring(0, 500)}...\n`;
            injected += entry;
          }
          messages.push({
            role: 'system',
            content: injected
          });
        }
      } catch (err) {
        console.warn('[docs-brain] autoInject failed:', err.message);
      }
    }

    return { prependContext: messages };
  }
}
