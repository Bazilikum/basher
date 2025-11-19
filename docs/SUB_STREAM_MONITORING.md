# Sub-Stream Monitoring for LLM and Custom Outputs

## Problem Statement

When executing commands that internally call LLM services (like Gemini) in streaming mode, or any custom streaming operations, we want to capture and display these streams separately from standard stdout/stderr. This allows:

- **Real-time visibility** into LLM responses as they stream
- **Separate UI rendering** for different output types (logs vs LLM vs metrics)
- **Better debugging** by isolating different output streams
- **Token tracking** specific to LLM streams
- **Custom stream types** for application-specific needs (metrics, debug, etc.)

## Use Case Example

```javascript
// Your script calling Gemini:
const response = await gemini.generateContentStream(prompt);

for await (const chunk of response.stream) {
  // Currently: This gets mixed into stdout
  console.log(chunk.text());

  // Desired: Send to dedicated LLM stream
  mcpStream.llm(chunk.text());
}
```

**Goal**: Display the LLM output in a separate "LLM Stream" tab in the web UI and VS Code extension, distinct from regular command output.

---

## Implementation Options

### Option 1: Special Output Markers

**Concept**: Wrap LLM/custom output with special delimiters in stdout, parse server-side.

**Implementation**:
```javascript
// In your script:
console.log('<<<LLM_STREAM_START>>>');
for await (const chunk of geminiStream) {
  process.stdout.write(chunk.text());
}
console.log('<<<LLM_STREAM_END>>>');
```

```typescript
// MCP server parser:
function parseSubStreams(stdout: string) {
  const llmPattern = /<<<LLM_STREAM_START>>>([\s\S]*?)<<<LLM_STREAM_END>>>/g;
  const llmMatches = [...stdout.matchAll(llmPattern)];

  return {
    llmStream: llmMatches.map(m => m[1]).join(''),
    cleanStdout: stdout.replace(llmPattern, '')
  };
}
```

**Pros**:
- ✅ Zero setup required
- ✅ Works immediately without infrastructure changes
- ✅ No network overhead
- ✅ Platform-agnostic

**Cons**:
- ❌ Fragile if markers appear in actual output
- ❌ Requires post-processing (not truly real-time)
- ❌ Hard to support multiple concurrent streams
- ❌ Ugly output when viewed directly

**Best For**: Quick prototyping, single-stream use cases

---

### Option 2: HTTP Callback Endpoint (Recommended)

**Concept**: MCP server exposes HTTP endpoint, scripts POST stream data to it.

**Implementation**:

```typescript
// MCP server: Create endpoint when executing command
const streamEndpoint = `http://localhost:${webPort}/api/stream/${processId}`;
const env = {
  ...process.env,
  MCP_STREAM_URL: streamEndpoint,
  MCP_PROCESS_ID: processId.toString()
};

const child = spawn(command, { env, cwd, shell: true });
```

```typescript
// New API endpoint in web-server.ts:
this.app.post('/api/stream/:processId/:streamType', async (req, res) => {
  const { processId, streamType } = req.params;
  const { content, metadata } = req.body;

  // Append to in-memory buffer for running commands
  processManager.appendSubStream(parseInt(processId), streamType, content);

  // Broadcast to connected clients
  this.broadcast('sub_stream_update', {
    processId: parseInt(processId),
    streamType,
    content,
    metadata,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true });
});
```

```javascript
// In your script:
const streamUrl = process.env.MCP_STREAM_URL;

async function streamToMCP(type, content) {
  if (!streamUrl) return; // Graceful degradation

  await fetch(`${streamUrl}/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

// Usage:
for await (const chunk of geminiStream) {
  await streamToMCP('llm', chunk.text());
}
```

**Pros**:
- ✅ Clean separation of concerns
- ✅ True real-time streaming
- ✅ Supports multiple stream types
- ✅ Works across network boundaries
- ✅ Easy to add metadata (tokens, model, etc.)
- ✅ Non-blocking (fire-and-forget with proper error handling)

**Cons**:
- ❌ Requires HTTP client in scripts
- ❌ Network overhead (minimal for localhost)
- ❌ Needs error handling for offline server

**Best For**: Production use, flexibility, real-time requirements

---

### Option 3: Named Pipes/FIFO (Unix)

**Concept**: Create named pipes for each stream type, scripts write to them.

**Implementation**:

```typescript
// MCP server: Create named pipes
import { mkfifo } from 'fs';
import { promisify } from 'util';

const pipePath = `/tmp/mcp-${processId}-llm.pipe`;
await promisify(mkfifo)(pipePath, 0o600);

const env = {
  ...process.env,
  MCP_LLM_PIPE: pipePath,
  MCP_METRICS_PIPE: `/tmp/mcp-${processId}-metrics.pipe`
};

// Read from pipe concurrently
const pipeStream = fs.createReadStream(pipePath);
pipeStream.on('data', (chunk) => {
  processManager.appendSubStream(processId, 'llm', chunk.toString());
  webServer.broadcast('sub_stream_update', {...});
});
```

```javascript
// In your script:
const fs = require('fs');
const llmPipe = fs.createWriteStream(process.env.MCP_LLM_PIPE);

for await (const chunk of geminiStream) {
  llmPipe.write(chunk.text() + '\n');
}

llmPipe.end();
```

**Pros**:
- ✅ Native Unix IPC (very efficient)
- ✅ True streaming
- ✅ No network overhead
- ✅ Simple protocol

**Cons**:
- ❌ Platform-specific (hard on Windows)
- ❌ Requires pipe cleanup
- ❌ File descriptor limits
- ❌ Complexity in error handling

**Best For**: Unix-only deployments, high-performance requirements

---

### Option 4: Structured JSON Lines (JSONL)

**Concept**: Wrap all output in JSON with type tags, parse stdout as JSONL.

**Implementation**:

```javascript
// In your script:
function mcpLog(type, content, metadata = {}) {
  console.log(JSON.stringify({
    type,       // 'stdout' | 'stderr' | 'llm' | 'metrics' | ...
    content,
    metadata,
    timestamp: new Date().toISOString()
  }));
}

// Usage:
mcpLog('stdout', 'Starting LLM call...');

for await (const chunk of geminiStream) {
  mcpLog('llm', chunk.text(), {
    tokens: chunk.usageMetadata?.candidatesTokenCount
  });
}

mcpLog('stderr', 'Warning: Rate limit approaching');
```

```typescript
// MCP server: Parse each line
child.stdout.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      switch (parsed.type) {
        case 'stdout':
          stdout += parsed.content + '\n';
          break;
        case 'llm':
          llmStream += parsed.content;
          webServer.broadcast('sub_stream_update', {
            processId,
            streamType: 'llm',
            content: parsed.content,
            metadata: parsed.metadata
          });
          break;
        // ... handle other types
      }
    } catch {
      // Fallback: treat as regular stdout
      stdout += line + '\n';
    }
  }
});
```

**Pros**:
- ✅ Structured and extensible
- ✅ Can include rich metadata
- ✅ Single output stream (no multi-channel complexity)
- ✅ Works on all platforms
- ✅ Easy to debug (just cat the output)

**Cons**:
- ❌ Requires wrapping all output
- ❌ JSON parsing overhead
- ❌ Output no longer human-readable when viewed directly
- ❌ Error-prone if JSON is malformed

**Best For**: Structured logging environments, when metadata is important

---

### Option 5: Helper Library/SDK

**Concept**: Provide a Node.js package that handles the protocol internally.

**Implementation**:

```typescript
// @basher/client package
export class MCPStreams {
  private streamUrl: string | undefined;
  private processId: string | undefined;
  private useJsonl: boolean;

  constructor(options?: { mode?: 'http' | 'jsonl' }) {
    this.streamUrl = process.env.MCP_STREAM_URL;
    this.processId = process.env.MCP_PROCESS_ID;
    this.useJsonl = options?.mode === 'jsonl' || !this.streamUrl;
  }

  async log(content: string) {
    return this.write('stdout', content);
  }

  async llm(content: string, metadata?: { tokens?: number; model?: string }) {
    return this.write('llm', content, metadata);
  }

  async metrics(content: string, metadata?: Record<string, any>) {
    return this.write('metrics', content, metadata);
  }

  async custom(streamType: string, content: string, metadata?: any) {
    return this.write(streamType, content, metadata);
  }

  private async write(type: string, content: string, metadata?: any) {
    if (this.streamUrl) {
      // HTTP mode
      try {
        await fetch(`${this.streamUrl}/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, metadata }),
          signal: AbortSignal.timeout(5000)
        });
      } catch (error) {
        // Fallback to stdout on error
        console.error(`MCP stream error: ${error}`);
        console.log(content);
      }
    } else if (this.useJsonl) {
      // JSONL mode
      console.log(JSON.stringify({ type, content, metadata, timestamp: new Date().toISOString() }));
    } else {
      // Fallback to regular stdout
      console.log(content);
    }
  }
}
```

```javascript
// In your script:
const { MCPStreams } = require('@basher/client');
const mcp = new MCPStreams();

await mcp.log('Starting Gemini call...');

for await (const chunk of geminiStream) {
  await mcp.llm(chunk.text(), {
    tokens: chunk.usageMetadata?.candidatesTokenCount,
    model: 'gemini-pro'
  });
}

await mcp.log('Complete!');
```

**Pros**:
- ✅ Best developer experience
- ✅ Protocol abstraction (can switch implementations)
- ✅ Graceful degradation
- ✅ Type safety (TypeScript)
- ✅ Versioning and updates centralized

**Cons**:
- ❌ Requires installing a package
- ❌ Extra dependency to maintain
- ❌ Coupling between server and client versions

**Best For**: Long-term maintainability, multiple users/scripts

---

## Database Schema Changes

### New Columns in `command_history` Table

```sql
-- For single LLM stream (simple case)
ALTER TABLE command_history ADD COLUMN llm_stream TEXT;

-- For multiple custom streams (extensible)
ALTER TABLE command_history ADD COLUMN sub_streams JSON;
-- Example JSON structure:
-- {
--   "llm": "Full LLM response text...",
--   "metrics": "Token count: 1234\nLatency: 234ms",
--   "debug": "Internal debug info..."
-- }
```

### Process Manager Enhancement

```typescript
// In process-manager.ts
interface RunningProcess {
  pid?: number;
  command: string;
  startTime: number;
  process: ChildProcess;
  subStreams: Map<string, string>; // NEW: Track sub-streams
}

class ProcessManager {
  appendSubStream(processId: number, streamType: string, content: string): void {
    const proc = this.processes.get(processId);
    if (!proc) return;

    const current = proc.subStreams.get(streamType) || '';
    proc.subStreams.set(streamType, current + content);
  }

  getSubStream(processId: number, streamType: string): string {
    return this.processes.get(processId)?.subStreams.get(streamType) || '';
  }
}
```

---

## UI Changes

### Web UI

Add sub-stream tabs to the output view:

```html
<div class="tabs">
  <button class="tab" data-stream="stdout">STDOUT</button>
  <button class="tab" data-stream="stderr">STDERR</button>
  <button class="tab" data-stream="llm">LLM Stream</button>
  <button class="tab" data-stream="metrics">Metrics</button>
  <button class="tab" data-stream="mixed">MIXED</button>
  <button class="tab" data-stream="info">INFO</button>
</div>

<div class="output-container">
  <pre id="stdout-output" class="output-pane"></pre>
  <pre id="stderr-output" class="output-pane hidden"></pre>
  <pre id="llm-output" class="output-pane hidden"></pre>
  <pre id="metrics-output" class="output-pane hidden"></pre>
  <pre id="mixed-output" class="output-pane hidden"></pre>
  <pre id="info-output" class="output-pane hidden"></pre>
</div>
```

**SSE Handler**:
```javascript
eventSource.addEventListener('sub_stream_update', (event) => {
  const { processId, streamType, content } = JSON.parse(event.data);

  // Update the appropriate output pane
  const outputPane = document.getElementById(`${streamType}-output`);
  if (outputPane) {
    outputPane.textContent += content;

    // Auto-scroll if user is at bottom
    if (outputPane.scrollHeight - outputPane.scrollTop === outputPane.clientHeight) {
      outputPane.scrollTop = outputPane.scrollHeight;
    }
  }
});
```

### VS Code Extension

Add sub-stream support to output panels:

```typescript
// In outputPanel.ts
private getHtmlForWebview(commandData: CommandHistoryItem): string {
  const subStreams = commandData.subStreams || {};

  const tabs = [
    { id: 'stdout', label: 'STDOUT' },
    { id: 'stderr', label: 'STDERR' },
    ...Object.keys(subStreams).map(key => ({ id: key, label: key.toUpperCase() })),
    { id: 'info', label: 'INFO' }
  ];

  // Generate tab buttons and content panes
  // ...
}
```

---

## MCP Tools for Sub-Stream Access

Add tools to query sub-streams:

```typescript
{
  name: 'get_command_with_streams',
  description: 'Get a command execution with all its sub-streams (stdout, stderr, llm, metrics, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      commandId: {
        type: 'number',
        description: 'The command ID'
      },
      streams: {
        type: 'array',
        items: { type: 'string' },
        description: 'Which streams to include (default: all). Options: stdout, stderr, llm, metrics, etc.'
      },
      outputLevel: {
        type: 'string',
        enum: ['summary', 'preview', 'excerpts', 'full'],
        description: 'Output detail level for each stream'
      }
    },
    required: ['commandId']
  }
}
```

---

## Recommended Implementation Path

### Phase 1: HTTP Callback Infrastructure
1. Add API endpoint `/api/stream/:processId/:streamType`
2. Enhance `ProcessManager` to track sub-streams
3. Add SSE broadcast for sub-stream updates
4. Update database schema with `sub_streams` JSON column
5. Test with manual `curl` calls

### Phase 2: UI Integration
1. Update web UI to show sub-stream tabs dynamically
2. Add SSE handler for `sub_stream_update` events
3. Update VS Code extension with sub-stream support
4. Save sub-streams to database on command completion

### Phase 3: Helper Library (Optional)
1. Create `@basher/client` package
2. Implement `MCPStreams` class
3. Add TypeScript definitions
4. Publish to npm or use as local package

### Phase 4: Advanced Features
1. Token counting for LLM streams
2. Stream-specific search/filtering
3. Stream comparison (diff mode)
4. Stream aggregation across commands

---

## Example Use Cases

### 1. LLM Streaming with Token Tracking

```javascript
const { MCPStreams } = require('@basher/client');
const mcp = new MCPStreams();

const response = await gemini.generateContentStream(prompt);

let totalTokens = 0;
for await (const chunk of response.stream) {
  const text = chunk.text();
  const tokens = chunk.usageMetadata?.candidatesTokenCount || 0;
  totalTokens += tokens;

  await mcp.llm(text, { tokens, totalTokens });
}

await mcp.metrics(`Total tokens used: ${totalTokens}`);
```

### 2. Multi-Model Comparison

```javascript
const responses = await Promise.all([
  gemini.generateContentStream(prompt),
  openai.chat.completions.create({ stream: true, ... })
]);

for await (const [geminiChunk, openaiChunk] of zip(responses)) {
  await mcp.custom('gemini', geminiChunk.text());
  await mcp.custom('openai', openaiChunk.choices[0].delta.content);
}
```

### 3. Debug Stream for Complex Scripts

```javascript
await mcp.log('Processing started');
await mcp.debug(`Config: ${JSON.stringify(config, null, 2)}`);

for (const item of items) {
  await mcp.debug(`Processing item ${item.id}`);
  const result = await processItem(item);
  await mcp.log(`Completed ${item.id}: ${result.status}`);
}
```

### 4. Real-time Metrics Dashboard

```javascript
setInterval(async () => {
  const metrics = {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    eventLoop: getEventLoopLag()
  };

  await mcp.metrics(JSON.stringify(metrics, null, 2));
}, 1000);
```

---

## Security Considerations

1. **Endpoint Authentication**: Consider adding token-based auth for the stream endpoint
   ```typescript
   const token = crypto.randomUUID();
   env.MCP_STREAM_TOKEN = token;

   // Validate in endpoint
   if (req.headers['authorization'] !== `Bearer ${expectedToken}`) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```

2. **Rate Limiting**: Prevent abuse of stream endpoint
   ```typescript
   const rateLimiter = new Map<number, number>(); // processId -> requestCount
   ```

3. **Content Validation**: Sanitize stream content to prevent XSS
   ```typescript
   const sanitizedContent = escapeHtml(content);
   ```

4. **Size Limits**: Cap sub-stream size to prevent memory issues
   ```typescript
   const MAX_SUBSTREAM_SIZE = 10 * 1024 * 1024; // 10MB
   ```

---

## Performance Considerations

1. **Buffering**: For high-frequency streams, buffer writes
   ```typescript
   class StreamBuffer {
     private buffer: string[] = [];
     private flushInterval: NodeJS.Timeout;

     constructor(private onFlush: (content: string) => void) {
       this.flushInterval = setInterval(() => this.flush(), 100);
     }

     append(content: string) {
       this.buffer.push(content);
       if (this.buffer.length > 100) this.flush();
     }

     private flush() {
       if (this.buffer.length === 0) return;
       this.onFlush(this.buffer.join(''));
       this.buffer = [];
     }
   }
   ```

2. **Compression**: For large streams, consider gzip compression

3. **Chunking**: Send large content in chunks to avoid blocking

---

## Future Enhancements

1. **Binary Streams**: Support for binary data (images, audio)
2. **Stream Replay**: Replay streams in real-time for demos
3. **Stream Export**: Export specific streams to files
4. **Stream Merging**: Combine multiple streams into timeline view
5. **Stream Filtering**: Regex/keyword filtering per stream
6. **Stream Highlighting**: Syntax highlighting based on stream type
7. **Websockets**: For bidirectional communication (interactive prompts)

---

## Questions to Resolve

- [ ] Which implementation option to use? (Recommend: Option 2 + Option 5)
- [ ] Should sub-streams be indexed/searchable like stdout/stderr?
- [ ] Maximum number of concurrent sub-streams per command?
- [ ] Should sub-streams persist in database or memory-only during execution?
- [ ] Token counting: automatic or manual via metadata?
- [ ] Stream naming conventions: camelCase, snake_case, or kebab-case?

---

## References

- [Server-Sent Events (SSE) Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Named Pipes (FIFO) - Linux Man Pages](https://man7.org/linux/man-pages/man7/fifo.7.html)
- [JSON Lines Format](https://jsonlines.org/)
- [Fetch API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
