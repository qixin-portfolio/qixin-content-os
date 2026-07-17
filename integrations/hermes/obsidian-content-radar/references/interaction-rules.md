# Interaction Rules

Use the fixed CLI result as evidence. Do not infer materials that are not returned.

For a search result, show no more than ten items. Each item may include its ordinal, title, author when present, source platform, saved date when present, a short CLI excerpt, and the relative path. Never show an absolute filesystem path.

For "看来源 N", validate that N refers to the last in-memory result list. Return the title, relative path, source URL, and existing excerpt for that item. Do not open the note again and do not visit the source URL.

## Empty Results

If the CLI `results` array is empty, send exactly:

> 当前授权的 Obsidian 收藏库中没有找到相关素材。

You may append only either or both of the following, while remaining within the current collection:

- 换一个关键词继续搜索当前收藏库。
- Recommend two or three same-topic synonyms for another search of the current collection.

Do not invoke, suggest, or name another tool or search location. Do not use web search, model knowledge, or a guessed source as a substitute.

## Response Boundary Check

Before sending a response, verify that it names no search scope other than the configured collection. Only the configured Obsidian collection may be named as the search scope. `笔记同步助手` may be used as its relative collection label. If a draft reply contains any route, location, or tool outside that scope, discard it and use the fixed empty-result response above when there are no results.
