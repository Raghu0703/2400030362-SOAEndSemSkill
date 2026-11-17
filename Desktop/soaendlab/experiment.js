/**
 * SOA Lab Experiment: API Gateway Round Robin Load Balancing
 * Master Orchestrator Script
 *
 * Steps performed:
 * 1. Spawns 3 backend microservice instances (ports 5001, 5002, 5003).
 * 2. Waits for all 3 instances to be healthy.
 * 3. Starts the API Gateway on port 8080 with the Round Robin route configured.
 * 4. Runs automated load distribution verification test.
 * 5. Serves interactive web dashboard and keeps processes alive for manual lab demonstration.
 */

const { fork } = require('child_process');
const http = require('http');
const path = require('path');
const { runVerification } = require('./tests/verify-distribution');

const INSTANCE_CONFIGS = [
  { port: 5001, id: 'Instance-1', name: 'Service-Alpha' },
  { port: 5002, id: 'Instance-2', name: 'Service-Beta' },
  { port: 5003, id: 'Instance-3', name: 'Service-Gamma' }
];

const GATEWAY_PORT = 8080;
const runningProcesses = [];

/**
 * Polls an endpoint until it responds with HTTP 200 or times out
 */
function waitForPort(port, path = '/health', maxAttempts = 25, delayMs = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}${path}`, res => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts >= maxAttempts) {
          reject(new Error(`Port ${port} responded with status ${res.statusCode}`));
        } else {
          setTimeout(check, delayMs);
        }
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, delayMs);
        }
      });
    };
    check();
  });
}

/**
 * Starts the 3 backend instances as separate isolated processes
 */
async function startInstances() {
  console.log('\n============================================================');
  console.log(' STEP 1: INITIALIZING THREE BACKEND SERVICE INSTANCES       ');
  console.log('============================================================');

  for (const cfg of INSTANCE_CONFIGS) {
    const child = fork(
      path.join(__dirname, 'backend-services', 'instance.js'),
      [cfg.port.toString(), cfg.id, cfg.name],
      {
        env: {
          ...process.env,
          PORT: cfg.port.toString(),
          INSTANCE_ID: cfg.id,
          INSTANCE_NAME: cfg.name
        },
        stdio: 'inherit'
      }
    );
    runningProcesses.push(child);
  }

  // Wait for all three instances to be fully ready
  await Promise.all(INSTANCE_CONFIGS.map(cfg => waitForPort(cfg.port)));
  console.log('✔ All 3 backend instances started successfully and reporting UP.\n');
}

/**
 * Starts the API Gateway
 */
async function startGateway() {
  console.log('============================================================');
  console.log(' STEP 2: INITIALIZING API GATEWAY & ROUND ROBIN ROUTE      ');
  console.log('============================================================');

  const child = fork(
    path.join(__dirname, 'gateway', 'gateway.js'),
    [],
    {
      env: {
        ...process.env,
        GATEWAY_PORT: GATEWAY_PORT.toString()
      },
      stdio: 'inherit'
    }
  );
  runningProcesses.push(child);

  await waitForPort(GATEWAY_PORT, '/gateway/status');
  console.log('✔ API Gateway started successfully and routed to the 3 instances.\n');
}

/**
 * Graceful termination handler
 */
function cleanup() {
  console.log('\nStopping all experiment processes...');
  runningProcesses.forEach(child => {
    try {
      child.kill('SIGINT');
    } catch (_) {}
  });
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

/**
 * Main Experiment Execution Runner
 */
async function runExperiment() {
  try {
    // 1. Set up three instances
    await startInstances();

    // 2. Setup gateway route
    await startGateway();

    // Small delay to allow health checks to synchronize
    await new Promise(r => setTimeout(r, 600));

    // 3. Verify load distribution
    console.log('============================================================');
    console.log(' STEP 3: EXECUTING LOAD DISTRIBUTION VERIFICATION           ');
    console.log('============================================================');
    await runVerification();

    // 4. Lab Instructions and Dashboard Access
    console.log('============================================================');
    console.log(' 🔬 EXPERIMENT EXECUTION COMPLETED & READY FOR EVALUATION   ');
    console.log('============================================================');
    console.log(`🌐 Web Visual Dashboard:  http://127.0.0.1:${GATEWAY_PORT}/dashboard`);
    console.log(`📡 Gateway API Endpoint:   http://127.0.0.1:${GATEWAY_PORT}/api/service`);
    console.log(`📊 Gateway Metrics:        http://127.0.0.1:${GATEWAY_PORT}/gateway/status`);
    console.log('\nPress Ctrl + C anytime in this terminal to terminate all services.\n');
  } catch (err) {
    console.error('Experiment encountered an error:', err);
    cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  runExperiment();
}

module.exports = {
  runExperiment,
  startInstances,
  startGateway
};
