# Basher Demo Recording Script

## Pre-Recording Checklist

1. **Clean workspace**: Close unnecessary VS Code panels/tabs
2. **WebUI open**: http://localhost:3000
3. **Extension open**: VS Code Basher sidebar visible
4. **Theme**: Dark mode preferred for professional look
5. **Clear history** (optional): `rm .basher/history.db` for fresh start

## Recording Sequence

### Scene 1: Quick Command (5-10s)
**What**: Execute a simple command, see instant result
**MCP tools**:
```
execute_command: echo "🚀 Basher demo started" && date
```

**What to highlight**: Command appears in both extension and WebUI instantly

---

### Scene 2: Background Command (15-20s)
**What**: Run a longer command, see it in "Running" state
**MCP tools**:
```
execute_command:
  command: bash -c 'echo "📦 Building..." && sleep 2 && echo "✓ Build complete (3 files, 156ms)"'
  title: "Build project"
  background: true
```

**What to highlight**:
- Command appears in "Running" section
- Pulsing indicator in WebUI
- Status changes to "completed" after 2 seconds

---

### Scene 3: Failed Command (5-10s)
**What**: Intentional error to show failure handling
**MCP tools**:
```
execute_command: ls /nonexistent/path
```

**What to highlight**: Red error indicator, clear error message

---

### Scene 4: Colored Output (5s)
**What**: Command with ANSI colors
**MCP tools**:
```
execute_command: npm test -- --help 2>&1 | head -20
```

**What to highlight**: Color preservation in output panel

---

### Scene 5: Template Workflow (15s)
**What**: Save a template, then run it
**MCP tools**:
```
save_template:
  name: "build"
  command: "echo '⚡ Fast build...' && sleep 1 && echo '✓ Done'"
  description: "Quick build command"
  tags: ["build", "dev"]

run_template: build
```

**What to highlight**: Template appears in dropdown, one-click execution

---

### Scene 6: Search History (10s)
**What**: Query past commands
**MCP tools**:
```
search_command_history: echo
get_command_by_id: {first command id}
get_aggregations: {groupBy: "command"}
```

**What to highlight**: Full-text search, filtering options

---

### Scene 7: Session Grouping (10s)
**What**: Group related commands
**MCP tools**:
```
start_session: {name: "Demo Recording", description: "Screen capture demo"}
execute_command: echo "Part of demo session"
end_session: {status: "completed"}
list_sessions: {}
```

**What to highlight**: Commands grouped by session in history

---

### Scene 8: Get Command Stats (5s)
**What**: Show overall statistics
**MCP tools**:
```
get_command_stats: {}
get_recent_commands: {limit: 5}
```

**What to highlight**: Success rate, average duration, total count

---

## Post-Recording

1. Trim dead time at start/end
2. Add subtle zoom on key UI elements
3. Consider overlay text for feature callouts
4. Export as: GIF for docs, MP4 for social media

## Tips

- **Pause 1-2s** between actions for visual clarity
- **Mouse hover** over elements before clicking to show intent
- **Keep window sizes** consistent throughout
- **Record at 2x resolution** (3840x2160) for crisp 1080p output
