/**
 * SOA API Gateway with Round Robin Load Balancing
 * Manages traffic distribution across 3 backend service instances.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const RoundRobinLoadBalancer = require('./roundRobinRouter');
const HealthChecker = require('./healthCheck');

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '8080', 10);

// Configuration: Define the 3 backend service instances
const BACKEND_INSTANCES = [
  { id: 'Instance-1', name: 'Service-Alpha', port: 5001, url: 'http://127.0.0.1:5001' },
  { id: 'Instance-2', name: 'Service-Beta', port: 5002, url: 'http://127.0.0.1:5002' },
  { id: 'Instance-3', name: 'Service-Gamma', port: 5003, url: 'http://127.0.0.1:5003' }
];

// Initialize Load Balancer and Health Checker
const loadBalancer = new RoundRobinLoadBalancer(BACKEND_INSTANCES);
const healthChecker = new HealthChecker(loadBalancer, 2500);

/**
 * Reverse-proxies request to selected target instance
 */
function forwardRequest(req, res, target) {
  const startTime = Date.now();
  const targetUrl = new URL(req.url, target.url);

  // Clone headers and append gateway routing metadata
  const proxyHeaders = { ...req.headers };
  proxyHeaders['host'] = `127.0.0.1:${target.port}`;
  proxyHeaders['x-forwarded-for'] = req.socket.remoteAddress;
  proxyHeaders['x-gateway-route'] = 'api-reverse-proxy';
  proxyHeaders['x-load-balancer'] = 'RoundRobin';
  proxyHeaders['x-selected-target'] = target.id;

  const options = {
    hostname: '127.0.0.1',
    port: target.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: proxyHeaders,
    timeout: 5000
  };

  const proxyReq = http.request(options, proxyRes => {
    const latencyMs = Date.now() - startTime;

    // Forward status code and target headers
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders['x-load-balancer'] = 'RoundRobin';
    responseHeaders['x-forwarded-to-instance'] = target.id;
    responseHeaders['x-forwarded-to-port'] = target.port.toString();
    responseHeaders['x-gateway-latency-ms'] = latencyMs.toString();

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Gateway Timeout',
      target: target.id,
      port: target.port,
      message: `Instance ${target.id} did not respond within timeout limit`
    }));
  });

  proxyReq.on('error', err => {
    console.error(`[API Gateway] Error forwarding to ${target.id} (: ${target.port}):`, err.message);
    // Mark target as unhealthy
    loadBalancer.updateTargetHealth(target.id, false);

    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Bad Gateway',
      target: target.id,
      message: `Failed to route request to instance: ${err.message}`
    }));
  });

  // Pipe request body into proxy request
  req.pipe(proxyReq);
}

// Create HTTP API Gateway Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Enable CORS for testing & web dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 1. Gateway Status & Metrics Endpoint
  if (pathname === '/gateway/status' || pathname === '/gateway/metrics') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    return res.end(JSON.stringify(loadBalancer.getMetrics(), null, 2));
  }

  // 2. Reset counters endpoint
  if (pathname === '/gateway/reset' && req.method === 'POST') {
    loadBalancer.resetCounters();
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true, message: 'Load balancer counters reset' }));
  }

  // 3. Batch simulation test endpoint (run N requests directly through Gateway)
  if (pathname === '/gateway/test/burst' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      let count = 15;
      try {
        const parsed = JSON.parse(body);
        if (parsed.count && parsed.count > 0) count = Math.min(parsed.count, 100);
      } catch (_) {}

      const results = [];
      for (let i = 1; i <= count; i++) {
        const target = loadBalancer.getNextTarget();
        if (target) {
          results.push({
            requestIndex: i,
            dispatchedTo: target.id,
            targetPort: target.port,
            timestamp: new Date().toISOString()
          });
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      return res.end(JSON.stringify({
        success: true,
        requestsSent: count,
        results,
        metrics: loadBalancer.getMetrics()
      }, null, 2));
    });
    return;
  }

  // 4. Interactive Visual Dashboard Route
  if (pathname === '/' || pathname === '/dashboard') {
    const dashboardPath = path.join(__dirname, '../public/dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      return fs.createReadStream(dashboardPath).pipe(res);
    }
  }

  // 5. Reverse Proxy Route: Forward all `/api/*` traffic through Round Robin
  if (pathname.startsWith('/api/')) {
    const target = loadBalancer.getNextTarget();

    if (!target) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(503);
      return res.end(JSON.stringify({
        error: 'Service Unavailable',
        message: 'No healthy backend instances available in the Round Robin pool'
      }));
    }

    // Execute reverse proxy forward
    return forwardRequest(req, res, target);
  }

  // 404 for unknown routes
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(404);
  res.end(JSON.stringify({
    error: 'Not Found',
    message: `Route ${pathname} not found on API Gateway. Use /api/* for load-balanced endpoints or /dashboard.`
  }));
});

// Function to start gateway programmatically or directly
function startGateway(port = GATEWAY_PORT) {
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`🌐 [API Gateway] Running at http://127.0.0.1:${port}`);
      console.log(`🔀 [Algorithm] Round-Robin active across 3 backend instances:`);
      BACKEND_INSTANCES.forEach(inst => {
        console.log(`   - ${inst.id} (${inst.name}) -> ${inst.url}`);
      });
      healthChecker.start();
      resolve(server);
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startGateway();
}

module.exports = {
  server,
  startGateway,
  loadBalancer,
  healthChecker,
  BACKEND_INSTANCES
};
