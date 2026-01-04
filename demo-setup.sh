#!/bin/bash
# Basher Demo Setup Script
# Run this first to populate some demo data, then use the MCP commands

set -e

echo "🎬 Setting up Basher demo environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}=== Creating demo commands ===${NC}"

# These will be run via Basher, showing different features
echo -e "${GREEN}✓${NC} Demo script ready"
echo -e "${YELLOW}→${NC} Run the MCP tool sequence below to generate activity"
echo ""
echo "Demo command suggestions:"
echo "  1. echo 'Building project...' && sleep 2 && echo '✓ Build complete'"
echo "  2. npm test -- --watch  (shows long-running output)"
echo "  3. ls -la --color=always  (shows colored output)"
echo "  4. make error-example    (shows failure handling)"
echo ""
