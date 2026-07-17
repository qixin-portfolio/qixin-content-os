# Interaction Rules

Use the fixed CLI result as evidence. Do not infer materials that are not returned.

For a search result, show no more than ten items. Each item may include its ordinal, title, author when present, source platform, saved date when present, a short CLI excerpt, and the relative path. Never show an absolute filesystem path.

For "看来源 N", validate that N refers to the last in-memory result list. Return the title, relative path, source URL, and existing excerpt for that item. Do not open the note again and do not visit the source URL.

If the search result is empty, say that no matching local material was found. Do not use web search, model knowledge, or a guessed source as a substitute.
