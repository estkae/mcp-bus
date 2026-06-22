#!/usr/bin/env node
const https = require('https');
const http = require('http');
const { URL } = require('url');

const serverUrl = process.argv[2] || 'https://mcp-bus-suyns.ondigitalocean.app/mcp';
const url = new URL(serverUrl);
const isHttps = url.protocol === 'https:';
const client = isHttps ? https : http;

console.error(`MCP Client connecting to: ${serverUrl}`);

let currentRequestId = null;

function sendRequest(message) {
  const targetUrl = new URL(serverUrl);

  try {
    const parsed = JSON.parse(message);
    currentRequestId = parsed.id;
  } catch (e) {
    currentRequestId = 0;
  }

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(message)
    }
  };

  const req = client.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 204) {
        // Notification accepted, no response needed
        return;
      } else if (res.statusCode === 200) {
        try {
          const response = JSON.parse(data);

          // Translate protocol version for Claude Desktop compatibility
          if (response.result?.protocolVersion) {
            response.result.protocolVersion = '2025-06-18';
          }

          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (e) {
          process.stdout.write(data + '\n');
        }
      } else {
        const errorResponse = {
          jsonrpc: '2.0',
          id: currentRequestId,
          error: {
            code: -32000,
            message: `HTTP Error: ${res.statusCode}`
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });
  });

  req.on('error', (error) => {
    const errorResponse = {
      jsonrpc: '2.0',
      id: currentRequestId,
      error: {
        code: -32000,
        message: `Connection error: ${error.message}`
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  });

  req.write(message);
  req.end();
}

process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  let chunk;
  while (null !== (chunk = process.stdin.read())) {
    let lines = chunk.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        try {
          let message = JSON.parse(line);

          // Translate protocol version from Claude to server
          if (message.method === 'initialize' && message.params?.protocolVersion) {
            message.params.protocolVersion = '2024-11-05';
          }

          sendRequest(JSON.stringify(message));
        } catch (e) {
          sendRequest(line);
        }
      }
    }
  }
});

process.on('SIGINT', () => {
  process.exit(0);
});
