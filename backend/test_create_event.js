require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const jwt = require('jsonwebtoken');
const axios = require('axios');
const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 4001;
const HOST = 'localhost';
const OUTPUT_FILE = path.join(__dirname, 'test_create_event_error.json');

function generateToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not found in .env');
  }

  const payload = {
    id: 1,
    email: 'admin@company.com',
    permissions: {
      all: true
    }
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: '24h'
  });

  console.log('[INFO] JWT_SECRET loaded from .env');
  console.log('[INFO] Generated JWT token for admin user (id=1, email=admin@company.com, permissions.all=true)');
  return token;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, HOST);
  });
}

function waitForServer(maxAttempts = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const client = new net.Socket();
      client.setTimeout(interval);
      client.on('connect', () => {
        client.destroy();
        resolve(true);
      });
      client.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Server did not start after ${maxAttempts * interval / 1000}s`));
        } else {
          setTimeout(check, interval);
        }
      });
      client.on('timeout', () => {
        client.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`Server did not start after ${maxAttempts * interval / 1000}s`));
        } else {
          setTimeout(check, interval);
        }
      });
      client.connect(PORT, HOST);
    };
    check();
  });
}

async function makeRequest(token) {
  const url = `http://${HOST}:${PORT}/api/calendar`;
  const body = {
    title: 'Test Event',
    startDateTime: '2026-09-22T00:00:00.000Z',
    endDateTime: '2026-09-22T23:59:00.000Z',
    isAllDay: true,
    category: 'CUSTOM',
    location: 'Room 1',
    description: 'test'
  };

  console.log(`[INFO] Making POST request to ${url}`);
  console.log(`[INFO] Request body:`, JSON.stringify(body, null, 2));

  try {
    const response = await axios.post(url, body, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });

    return {
      statusCode: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.data
    };
  } catch (error) {
    if (error.response) {
      return {
        statusCode: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        body: error.response.data
      };
    }
    throw error;
  }
}

async function main() {
  let backendProcess = null;
  let startedBackend = false;

  try {
    console.log('========================================');
    console.log('Calendar Create Event Test Script');
    console.log('========================================\n');

    const token = generateToken();

    const portInUse = await isPortInUse(PORT);
    if (!portInUse) {
      console.log(`[INFO] Backend not running on :${PORT}, starting it now...`);
      const entryPath = path.join(__dirname, 'src', 'index.js');
      backendProcess = spawn('node', [entryPath], {
        cwd: __dirname,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      backendProcess.stdout.on('data', (data) => {
        process.stdout.write(`[BACKEND OUT] ${data}`);
      });
      backendProcess.stderr.on('data', (data) => {
        process.stderr.write(`[BACKEND ERR] ${data}`);
      });

      backendProcess.on('exit', (code) => {
        if (startedBackend) console.log(`[INFO] Backend process exited with code ${code}`);
      });

      startedBackend = true;
      await waitForServer(40, 1000);
      console.log(`[INFO] Backend is now listening on :${PORT}`);
    } else {
      console.log(`[INFO] Backend already running on :${PORT}`);
    }

    const responseData = await makeRequest(token);

    console.log(`\n[INFO] Response Status: ${responseData.statusCode} ${responseData.statusText}`);
    console.log(`[INFO] Writing full response to: ${OUTPUT_FILE}`);

    const output = {
      timestamp: new Date().toISOString(),
      request: {
        method: 'POST',
        url: `http://${HOST}:${PORT}/api/calendar`,
        headers: {
          'Authorization': `Bearer <token hidden>`,
          'Content-Type': 'application/json'
        },
        body: {
          title: 'Test Event',
          startDateTime: '2026-09-22T00:00:00.000Z',
          endDateTime: '2026-09-22T23:59:00.000Z',
          isAllDay: true,
          category: 'CUSTOM',
          location: 'Room 1',
          description: 'test'
        }
      },
      response: responseData
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log('[INFO] File written successfully');

    console.log('\n========================================');
    console.log('Captured Response:');
    console.log('========================================');
    console.log(JSON.stringify(output, null, 2));

    return output;

  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error(error.stack);

    const errorOutput = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack
      }
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(errorOutput, null, 2), 'utf-8');
    return errorOutput;

  } finally {
    if (startedBackend && backendProcess) {
      console.log('\n[INFO] Killing backend process...');
      try {
        backendProcess.kill('SIGINT');
        setTimeout(() => {
          if (!backendProcess.killed) {
            backendProcess.kill('SIGKILL');
          }
        }, 3000);
      } catch (err) {
        console.error('[ERROR] Failed to kill backend:', err.message);
      }
    }
  }
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

module.exports = { main, generateToken };
