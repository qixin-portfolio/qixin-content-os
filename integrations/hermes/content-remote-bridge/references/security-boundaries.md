# Remote Content Bridge Security Boundaries

- Only a configured owner chat hash may invoke the bridge.
- The router calls a fixed local wrapper with JSON stdin. It never exposes a terminal tool to a generic Agent.
- Inputs containing local paths, traversal, downloads, backups, or unapproved material fields are rejected.
- External material handoff accepts only source ID, title, author, source URL, and excerpt from the radar session.
- The Content OS generation service owns FactLedger, attribution, quality checks, and directed repair. The bridge never builds a second prompt.
- Session files contain no API key, full prompt, absolute local path, or database identifier and expire after 24 hours.
- Replies never include FactLedger, fact IDs, internal rejection reasons, prompts, or local filesystem paths.
