#!/usr/bin/env node

// Test script to see what Docker Compose sends to provider on stdin
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const logFile = path.join(__dirname, 'provider-debug.log');
const log = msg => fs.appendFileSync(logFile, msg + '\n');

log('=== Docker Compose Provider Test ===');
log('Time: ' + new Date().toISOString());
log('Arguments: ' + JSON.stringify(process.argv.slice(2)));
log('CWD: ' + process.cwd());

// Forward to actual docker-azure and capture output
const dockerAzure = spawn('docker-azure', process.argv.slice(2), {
  stdio: ['inherit', 'inherit', 'pipe']  // stdin/stdout inherit, stderr capture
});

dockerAzure.stderr.on('data', data => {
  log('STDERR from docker-azure: ' + data.toString());
});

dockerAzure.on('close', code => {
  log('docker-azure exited with code: ' + code);
  log('=== End Test ===\n');
  process.exit(code);
});
