# Token Efficiency

Basher is designed from the ground up for **token efficiency** when used with AI agents. Large command outputs can quickly consume your context window - these features help minimize token usage while preserving the information you need.

## Tiered Output Levels

Control the level of detail in responses to save tokens:

| Output Level | Token Savings | Use Case | What's Included |
|-------------|---------------|----------|-----------------|
| `summary` | ~90% | Quick overview, statistics | Metadata only: command, timestamp, exit code, duration, output lengths |
| `preview` | ~75% | First impression | Metadata + first/last 5 lines of output |
| `excerpts` | ~95% | Targeted debugging | Metadata + only matching lines with configurable context |
| `full` | 0% | Deep analysis | Complete stdout and stderr |

**Example savings:**
- Full output: 10,000 tokens
- Summary: 100 tokens (99% savings)
- Excerpts with 3 lines context: 500 tokens (95% savings)

## Smart Search & Filtering

Use `advanced_search` with filters to get only relevant results:

```typescript
// Instead of fetching all commands and filtering client-side:
// ❌ get_recent_commands({ limit: 1000 }) → 50,000 tokens

// Use server-side filtering:
// ✅ advanced_search with filters → 500 tokens
{
  "query": "error",
  "outputLevel": "excerpts",
  "filters": {
    "exitCodes": [1],
    "dateRange": { "from": "2025-01-17T00:00:00Z" }
  }
}
```

## Aggregations

Get statistics about many commands in a single query instead of fetching and processing individual results:

```typescript
// Instead of:
// ❌ get_recent_commands({ limit: 1000 }) → analyze → 50,000 tokens

// Use aggregations:
// ✅ get_aggregations({ groupBy: "command", includeStats: true }) → 200 tokens
```

## Best Practices

1. **Start with `summary`**: Use `summary` output level to find the right command, then request `full` output only for that specific command
2. **Use filters**: Apply server-side filters instead of fetching all results
3. **Leverage aggregations**: Get counts and statistics without fetching individual results
4. **Use excerpts for debugging**: When searching for errors, `excerpts` mode shows only relevant lines
5. **Chain queries**: Use `get_similar_commands` or `get_command_chain` to understand context without broad searches

**Example workflow (token-efficient):**
```typescript
// 1. Find failed commands (200 tokens)
get_last_failures({ limit: 10, outputLevel: "summary" })

// 2. Get details for specific failure (500 tokens)
advanced_search({
  query: "error",
  outputLevel: "excerpts",
  filters: { exitCodes: [1] }
})

// 3. Compare with successful run (300 tokens)
compare_executions({ commandId1: 42, commandId2: 40 })

// Total: ~1,000 tokens instead of 50,000+
```

## Toon Format

Basher supports **Toon (Token-Oriented Object Notation)** - a compact format designed specifically for LLMs that achieves **~40% additional token savings** on top of existing optimization strategies.

### What is Toon?

Toon encodes uniform arrays of objects as tables rather than repetitive JSON structures:

**Standard JSON** (250+ tokens):
```json
{
  "commands": [
    {"id": 1, "command": "npm test", "exitCode": 0, "duration": 1234},
    {"id": 2, "command": "npm build", "exitCode": 0, "duration": 2345},
    {"id": 3, "command": "git status", "exitCode": 0, "duration": 123}
  ]
}
```

**Toon Format** (~100 tokens, 60% savings):
```
commands[3]{id,command,exitCode,duration}:
 1,npm test,0,1234
 2,npm build,0,2345
 3,git status,0,123
```

### Cumulative Token Savings

Combining Toon with existing optimizations:

| Feature Combination | Token Savings |
|---------------------|---------------|
| Full output (JSON) | 0% (baseline) |
| Summary level (JSON) | ~90% |
| **Summary + Toon** | **~94%** (60x more efficient!) |
| Excerpts (JSON) | ~95% |
| **Excerpts + Toon** | **~97%** |

### Usage

**Get recent commands in Toon format:**
```typescript
get_recent_commands({
  limit: 50,
  outputFormat: "toon"
})
```

**Advanced search with maximum efficiency:**
```typescript
advanced_search({
  query: "npm",
  outputLevel: "summary",
  outputFormat: "toon",
  limit: 100
})
// Result: ~94% total token savings!
```

### Supported Tools

- ✅ `get_recent_commands`
- ✅ `advanced_search`
- ⏳ More tools coming soon
