import { spawn } from 'child_process';

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';

server.stdout.on('data', (data) => {
  output += data.toString();
  console.log('📤 Server output:', data.toString());
});

server.stderr.on('data', (data) => {
  console.error('⚠️ Server stderr:', data.toString());
});

// Send initialize request
setTimeout(() => {
  console.log('📨 Sending initialize request...');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Send tools/list request
setTimeout(() => {
  console.log('📨 Sending tools/list request...');
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 2000);

// Send execute_command test
setTimeout(() => {
  console.log('📨 Sending execute_command request...');
  const executeRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'execute_command',
      arguments: {
        command: 'echo "Hello from Command N Conquer!"',
        timeout: 5000
      }
    }
  };
  server.stdin.write(JSON.stringify(executeRequest) + '\n');
}, 3000);

// Cleanup after 5 seconds
setTimeout(() => {
  console.log('✅ Test complete, shutting down server...');
  server.kill();
  process.exit(0);
}, 5000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});
