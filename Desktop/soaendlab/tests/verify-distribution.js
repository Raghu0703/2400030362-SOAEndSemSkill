/**
 * Verification Test Suite for Round Robin Load Balancing
 * Tests and verifies strict load distribution across the 3 instances.
 */
const http = require('http');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';
const TOTAL_TEST_REQUESTS = 15; // Divisible by 3 for exact 5-5-5 distribution

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GATEWAY_URL);
    const req = http.get(url, { timeout: 3000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            raw: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

async function runVerification() {
  console.log('\n============================================================');
  console.log('       SOA LAB EXPERIMENT: LOAD DISTRIBUTION VERIFIER       ');
  console.log('============================================================');
  console.log(`Target Gateway: ${GATEWAY_URL}`);
  console.log(`Total Requests: ${TOTAL_TEST_REQUESTS}`);
  console.log(`Expected Allocation per instance: ${TOTAL_TEST_REQUESTS / 3} requests (33.33% each)\n`);

  // Step 1: Reset Gateway Counters
  try {
    await fetch(`${GATEWAY_URL}/gateway/reset`, { method: 'POST' });
  } catch (_) {}

  // Step 2: Dispatch sequential requests through Gateway Route
  const dispatchHistory = [];
  const instanceCounts = {
    'Instance-1': 0,
    'Instance-2': 0,
    'Instance-3': 0
  };

  console.log('--- [Phase 1: Sequential Request Routing] ---');
  for (let i = 1; i <= TOTAL_TEST_REQUESTS; i++) {
    try {
      const res = await makeRequest('/api/data?testSeq=' + i);
      const targetInstance = res.headers['x-forwarded-to-instance'] || (res.body && res.body.instance && res.body.instance.id);
      const targetPort = res.headers['x-forwarded-to-port'] || (res.body && res.body.instance && res.body.instance.port);
      const latency = res.headers['x-gateway-latency-ms'] || '1';

      if (targetInstance && instanceCounts[targetInstance] !== undefined) {
        instanceCounts[targetInstance]++;
      }

      dispatchHistory.push(targetInstance);

      console.log(`Request #${String(i).padStart(2, ' ')} -> Routed to: [${targetInstance}] on Port :${targetPort} (Latency: ${latency}ms) [HTTP ${res.statusCode}]`);
    } catch (err) {
      console.error(`Request #${i} Failed:`, err.message);
    }
  }

  // Step 3: Verify Round-Robin Sequence Pattern
  console.log('\n--- [Phase 2: Mathematical Sequence Validation] ---');
  const expectedCycle = ['Instance-1', 'Instance-2', 'Instance-3'];
  let sequenceMatches = true;

  for (let i = 0; i < dispatchHistory.length; i++) {
    const expected = expectedCycle[i % expectedCycle.length];
    if (dispatchHistory[i] !== expected) {
      sequenceMatches = false;
      console.warn(`⚠️ Sequence mismatch at request #${i + 1}: Expected ${expected}, got ${dispatchHistory[i]}`);
    }
  }

  if (sequenceMatches) {
    console.log('✅ Sequence Verification: STRICT ROUND-ROBIN ROTATION CONFIRMED');
    console.log('   Pattern followed: (Instance-1 -> Instance-2 -> Instance-3) x ' + (TOTAL_TEST_REQUESTS / 3));
  } else {
    console.log('⚠️ Sequence Verification: Variation detected (check if an instance was marked down)');
  }

  // Step 4: Verification Statistics Table
  console.log('\n--- [Phase 3: Load Distribution Metrics Table] ---');
  console.log('+------------+------------+---------------+----------------+');
  console.log('| Instance   | Port       | Requests Rcvd | Traffic Share  |');
  console.log('+------------+------------+---------------+----------------+');

  const ports = { 'Instance-1': 5001, 'Instance-2': 5002, 'Instance-3': 5003 };
  let allEvenlyDistributed = true;

  Object.keys(instanceCounts).forEach(id => {
    const count = instanceCounts[id];
    const pct = ((count / TOTAL_TEST_REQUESTS) * 100).toFixed(1) + '%';
    const port = ports[id];
    console.log(`| ${id.padEnd(10, ' ')} | :${String(port).padEnd(9, ' ')} | ${String(count).padStart(13, ' ')} | ${pct.padStart(14, ' ')} |`);
    if (count !== TOTAL_TEST_REQUESTS / 3) {
      allEvenlyDistributed = false;
    }
  });
  console.log('+------------+------------+---------------+----------------+');
  console.log(`| TOTAL      |            | ${String(TOTAL_TEST_REQUESTS).padStart(13, ' ')} |        100.0%  |`);
  console.log('+------------+------------+---------------+----------------+\n');

  if (allEvenlyDistributed) {
    console.log('🎯 RESULT: PASS');
    console.log('Load balance verification succeeded: perfectly distributed 33.33% across all 3 instances!\n');
    return true;
  } else {
    console.log('⚠️ RESULT: Distribution variance detected.');
    return false;
  }
}

if (require.main === module) {
  runVerification().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runVerification };
