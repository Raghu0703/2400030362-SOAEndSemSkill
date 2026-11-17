/**
 * Background Health Checker for API Gateway
 * Ensures Round Robin load balancer only dispatches to alive backend instances.
 */
const http = require('http');

class HealthChecker {
  constructor(loadBalancer, intervalMs = 3000) {
    this.loadBalancer = loadBalancer;
    this.intervalMs = intervalMs;
    this.timer = null;
  }

  /**
   * Probes a single backend target
   */
  probeTarget(target) {
    return new Promise(resolve => {
      const url = new URL('/health', target.url);
      const req = http.get(url, { timeout: 1500 }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const isHealthy = res.statusCode === 200;
          const statusChanged = this.loadBalancer.updateTargetHealth(target.id, isHealthy);
          if (statusChanged) {
            console.log(
              `[Gateway HealthCheck] Instance ${target.id} (: ${target.port}) status changed to: ${
                isHealthy ? '🟢 UP' : '🔴 DOWN'
              }`
            );
          }
          resolve({ id: target.id, healthy: isHealthy });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        this.loadBalancer.updateTargetHealth(target.id, false);
        resolve({ id: target.id, healthy: false, error: 'Timeout' });
      });

      req.on('error', err => {
        this.loadBalancer.updateTargetHealth(target.id, false);
        resolve({ id: target.id, healthy: false, error: err.message });
      });
    });
  }

  /**
   * Probe all targets immediately
   */
  async checkAll() {
    const checks = this.loadBalancer.targets.map(t => this.probeTarget(t));
    return Promise.all(checks);
  }

  /**
   * Start periodic background health checking
   */
  start() {
    this.checkAll();
    this.timer = setInterval(() => {
      this.checkAll();
    }, this.intervalMs);
  }

  /**
   * Stop health checking timer
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = HealthChecker;
