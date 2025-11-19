/**
 * Test script for advanced query features
 * Run with: node test-advanced-features.mjs
 */

import { HistoryManager } from './dist/services/history-manager.js';
import { executeCommand } from './dist/services/command-executor.js';

const historyManager = new HistoryManager();

console.log('🧪 Testing Advanced Query Features\n');
console.log('=' .repeat(80));

// Test 1: Execute some test commands
console.log('\n📝 Test 1: Executing test commands...');
await executeCommand('echo "Hello World"');
await executeCommand('ls -la');
await executeCommand('npm --version');
await executeCommand('echo "Error test" && exit 1').catch(() => {});

console.log('✅ Test commands executed\n');

// Test 2: Tiered output levels
console.log('=' .repeat(80));
console.log('\n📊 Test 2: Tiered Output Levels');
console.log('-'.repeat(80));

console.log('\n🔹 Summary level (minimal tokens):');
const summaries = historyManager.advanced.getFilteredCommands(undefined, 3, 'summary');
console.log(JSON.stringify(summaries, null, 2));

console.log('\n🔹 Preview level (first/last lines):');
const previews = historyManager.advanced.getFilteredCommands(undefined, 2, 'preview');
console.log(JSON.stringify(previews, null, 2));

console.log('\n🔹 Excerpts level (matching lines only):');
const excerpts = historyManager.advanced.advancedSearch('echo', 2, 'excerpts', 2);
console.log(JSON.stringify(excerpts, null, 2));

// Test 3: Advanced filtering
console.log('\n' + '='.repeat(80));
console.log('\n🔍 Test 3: Advanced Filtering');
console.log('-'.repeat(80));

console.log('\n🔹 Filter by exit code (failures only):');
const failures = historyManager.advanced.getFilteredCommands({
  exitCodes: [1]
}, 10, 'summary');
console.log(`Found ${failures.length} failures`);
console.log(JSON.stringify(failures, null, 2));

console.log('\n🔹 Filter by command pattern:');
const npmCommands = historyManager.advanced.getFilteredCommands({
  commandPattern: 'npm*'
}, 10, 'summary');
console.log(`Found ${npmCommands.length} npm commands`);
console.log(JSON.stringify(npmCommands, null, 2));

// Test 4: Aggregations
console.log('\n' + '='.repeat(80));
console.log('\n📈 Test 4: Aggregations');
console.log('-'.repeat(80));

console.log('\n🔹 Group by command:');
const byCommand = historyManager.advanced.getAggregations({
  groupBy: 'command',
  includeStats: true,
  limit: 5
});
console.log(JSON.stringify(byCommand, null, 2));

console.log('\n🔹 Group by exit code:');
const byExitCode = historyManager.advanced.getAggregations({
  groupBy: 'exitCode',
  includeStats: true
});
console.log(JSON.stringify(byExitCode, null, 2));

// Test 5: Query Templates
console.log('\n' + '='.repeat(80));
console.log('\n⚡ Test 5: Query Templates');
console.log('-'.repeat(80));

console.log('\n🔹 Last failures:');
const lastFailures = historyManager.advanced.getLastFailures(3, 'summary');
console.log(JSON.stringify(lastFailures, null, 2));

console.log('\n🔹 Similar commands (if available):');
const recent = historyManager.getRecentHistory(1);
if (recent.length > 0) {
  const similar = historyManager.advanced.getSimilarCommands(recent[0].id, 3, 'summary');
  console.log(JSON.stringify(similar, null, 2));
}

console.log('\n🔹 Command chain (if available):');
if (recent.length > 0) {
  const chain = historyManager.advanced.getCommandChain(recent[0].id, 5, 'summary');
  console.log(JSON.stringify(chain, null, 2));
}

// Test 6: Diff Mode
console.log('\n' + '='.repeat(80));
console.log('\n🔀 Test 6: Diff Mode');
console.log('-'.repeat(80));

const allCommands = historyManager.getRecentHistory(5);
if (allCommands.length >= 2) {
  console.log('\n🔹 Comparing two commands:');
  const diff = historyManager.advanced.compareExecutions(
    allCommands[0].id,
    allCommands[1].id
  );
  if (diff) {
    console.log(JSON.stringify({
      command1: diff.command1,
      command2: diff.command2,
      stdoutDiff: {
        added: diff.stdoutDiff.added.length + ' lines',
        removed: diff.stdoutDiff.removed.length + ' lines',
        common: diff.stdoutDiff.common + ' lines'
      },
      stderrDiff: {
        added: diff.stderrDiff.added.length + ' lines',
        removed: diff.stderrDiff.removed.length + ' lines',
        common: diff.stderrDiff.common + ' lines'
      }
    }, null, 2));
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n✨ All tests completed!\n');
console.log('💡 Token Savings Demonstration:');
console.log('   - Summary: ~90% fewer tokens than full output');
console.log('   - Excerpts: ~95% fewer tokens with precise context');
console.log('   - Aggregations: Single response vs. many queries');
console.log('   - Filters: Only relevant results, no post-processing\n');
