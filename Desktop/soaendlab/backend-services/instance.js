/**
 * Backend Service Instance for SOA Load Balancing Experiment
 * Represents an individual microservice replica in the distributed cluster.
 */
const http = require('http');

const PORT = parseInt(process.env.PORT || process.argv[2] || '5001', 10);
const INSTANCE_ID = process.env.INSTANCE_ID || process.argv[3] || `Instance-${PORT}`;
const INSTANCE_NAME = process.env.INSTANCE_NAME || process.argv[4] || `Service-${PORT}`;

let requestCount = 0;
let isHealthy = true;
const startTime = Date.now();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Set standard response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Served-By-Instance', INSTANCE_ID);
  res.setHeader('X-Served-By-Port', PORT.toString());

  // 1. Health check endpoint for Gateway probe
  if (pathname === '/health') {
    if (!isHealthy) {
      res.writeHead(503);
      return res.end(JSON.stringify({
        status: 'DOWN',
        instanceId: INSTANCE_ID,
        port: PORT,
        error: 'Service simulated failure'
      }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: 'UP',
      instanceId: INSTANCE_ID,
      instanceName: INSTANCE_NAME,
      port: PORT,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      totalRequestsServed: requestCount
    }));
  }

  // 2. Failure simulation endpoints (to test dynamic load balancer failover)
  if (pathname === '/api/simulate/crash' && req.method === 'POST') {
    isHealthy = false;
    console.log(`[${INSTANCE_ID}] ⚠️  Simulated CRASH triggered. Service is now reporting DOWN.`);
    res.writeHead(200);
    return res.end(JSON.stringify({ message: `${INSTANCE_ID} marked DOWN`, status: 'DOWN' }));
  }

  if (pathname === '/api/simulate/recover' && req.method === 'POST') {
    isHealthy = true;
    console.log(`[${INSTANCE_ID}] 🟢 Simulated RECOVERY triggered. Service is now UP.`);
    res.writeHead(200);
    return res.end(JSON.stringify({ message: `${INSTANCE_ID} recovered`, status: 'UP' }));
  }

  // If service is currently simulated as down, reject requests with 503
  if (!isHealthy) {
    res.writeHead(503);
    return res.end(JSON.stringify({
      error: 'Service Unavailable',
      instanceId: INSTANCE_ID,
      port: PORT
    }));
  }

  // 3. Application API Routes (handled by Round Robin through API Gateway)
  let bodyData = '';
  req.on('data', chunk => { bodyData += chunk; });
  req.on('end', () => {
    requestCount++;
    const timestamp = new Date().toISOString();

    console.log(`[${INSTANCE_ID} on :${PORT}] -> Handled Request #${requestCount} [${req.method} ${pathname}]`);

    let parsedBody = null;
    if (bodyData) {
      try { parsedBody = JSON.parse(bodyData); } catch (_) { parsedBody = bodyData; }
    }

    const responsePayload = {
      success: true,
      message: `Response from ${INSTANCE_ID} (${INSTANCE_NAME})`,
      instance: {
        id: INSTANCE_ID,
        name: INSTANCE_NAME,
        port: PORT,
        host: 'localhost',
        pid: process.pid
      },
      stats: {
        instanceRequestSequence: requestCount,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
      },
      request: {
        method: req.method,
        path: pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: {
          'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          'x-gateway-route': req.headers['x-gateway-route'] || 'direct',
          'x-load-balancer': req.headers['x-load-balancer'] || 'none'
        },
        body: parsedBody
      },
      timestamp
    };

    res.writeHead(200);
    res.end(JSON.stringify(responsePayload, null, 2));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 [Backend Instance] ${INSTANCE_ID} (${INSTANCE_NAME}) listening on http://127.0.0.1:${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

module.exports = server;
