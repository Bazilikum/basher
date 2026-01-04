#!/bin/bash
# Demo data generator for Basher recordings
# Generates visually appealing commands with different output types

echo -e "\033[1;36m🎬 Basher Demo Recording - Command Sequence\033[0m"
echo ""

# Pause helper
pause() {
    echo ""
    read -p "▶️  Press Enter to run next command..."
    echo ""
}

# Scene 1: Success with emoji output
echo -e "\033[1;33m[Scene 1] Simple command with emoji output\033[0m"
pause
echo "🚀 Build started..."
sleep 1
echo "📦 Compiling 12 files..."
sleep 1
echo "✅ Build complete! (234ms)"
echo ""

# Scene 2: Multiple lines with progress
echo -e "\033[1;33m[Scene 2] Multi-line output with progress\033[0m"
pause
echo "→ Connecting to database..."
echo "✓ Connected (localhost:5432)"
echo "→ Running migrations..."
echo "  ✓ 001_initial_schema.sql"
echo "  ✓ 002_add_users_table.sql"
echo "  ✓ 003_add_indexes.sql"
echo "✓ All migrations complete"
echo ""

# Scene 3: Error handling
echo -e "\033[1;33m[Scene 3] Error output\033[0m"
pause
echo "→ Validating configuration..."
echo "❌ Error: Missing required field 'API_KEY' in config/.env"
echo "   at line 42 of config/loader.ts"
echo ""

# Scene 4: JSON output
echo -e "\033[1;33m[Scene 4] Structured JSON output\033[0m"
pause
cat <<'EOF'
{
  "status": "success",
  "duration": "1.234s",
  "tests": {
    "total": 42,
    "passed": 41,
    "failed": 1,
    "skipped": 0
  },
  "coverage": {
    "statements": "94.2%",
    "branches": "89.1%",
    "functions": "96.5%"
  }
}
EOF
echo ""

# Scene 5: Table output
echo -e "\033[1;33m[Scene 5] Table/list output\033[0m"
pause
echo "ID  │ NAME              │ STATUS    │ DURATION"
echo "────┼───────────────────┼───────────┼──────────"
echo "001 │ build-assets      │ ✓ success │ 2.3s"
echo "002 │ run-tests         │ ✓ success │ 5.1s"
echo "003 │ bundle            │ ✓ success │ 1.8s"
echo "004 │ deploy            │ ⏳ running │ ...    "
echo ""

# Scene 6: Git-style colored output
echo -e "\033[1;33m[Scene 6] Git-style colored output\033[0m"
pause
echo -e "\033[0;32mOn branch feature/add-demo-mode\033[0m"
echo -e "Your branch is up to date with 'origin/feature/add-demo-mode'."
echo ""
echo -e "\033[0;36mChanges to be committed:\033[0m"
echo -e "  \033[0;32mmodified:   src/index.ts\033[0m"
echo -e "  \033[0;32mnew file:   demo-commands.md\033[0m"
echo ""

echo -e "\033[1;32m✨ Demo sequence complete!\033[0m"
echo ""
