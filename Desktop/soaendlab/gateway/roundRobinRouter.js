/**
 * Round Robin Load Balancer Implementation for API Gateway
 * SOA Principles: Dynamic routing, request distribution, and high availability.
 */

class RoundRobinLoadBalancer {
  constructor(initialTargets = []) {
    this.targets = initialTargets.map(t => ({
      ...t,
      healthy: t.healthy !== undefined ? t.healthy : true,
      lastChecked: null,
      consecutiveFailures: 0
    }));

    this.currentIndex = 0;
    this.totalRequestsRouted = 0;
    this.distributionStats = {};
    this.recentRoutingHistory = [];
    this.maxHistorySize = 50;

    // Initialize distribution counters
    this.targets.forEach(target => {
      this.distributionStats[target.id] = {
        id: target.id,
        name: target.name,
        port: target.port,
        url: target.url,
        requestCount: 0,
        percentage: '0.0%'
      };
    });
  }

  /**
   * Core Round Robin Selection Algorithm:
   * Selects the next healthy target in strict circular rotation.
   */
  getNextTarget() {
    const healthyTargets = this.targets.filter(target => target.healthy);

    if (healthyTargets.length === 0) {
      return null; // All targets down
    }

    // Mathematical Round Robin calculation:
    // targetIndex = currentIndex mod activeCount
    const selectedTarget = healthyTargets[this.currentIndex % healthyTargets.length];

    // Advance pointer for next incoming request
    this.currentIndex = (this.currentIndex + 1) % healthyTargets.length;
    this.totalRequestsRouted++;

    // Update statistical counters
    const stat = this.distributionStats[selectedTarget.id];
    if (stat) {
      stat.requestCount++;
      this.recalculatePercentages();
    }

    // Keep history log for audit and verification
    const historyEntry = {
      sequenceNumber: this.totalRequestsRouted,
      targetId: selectedTarget.id,
      targetPort: selectedTarget.port,
      timestamp: new Date().toISOString()
    };
    this.recentRoutingHistory.push(historyEntry);
    if (this.recentRoutingHistory.length > this.maxHistorySize) {
      this.recentRoutingHistory.shift();
    }

    return selectedTarget;
  }

  /**
   * Recalculates traffic distribution percentages across all targets
   */
  recalculatePercentages() {
    if (this.totalRequestsRouted === 0) return;
    Object.keys(this.distributionStats).forEach(id => {
      const count = this.distributionStats[id].requestCount;
      const pct = ((count / this.totalRequestsRouted) * 100).toFixed(2);
      this.distributionStats[id].percentage = `${pct}%`;
    });
  }

  /**
   * Dynamically update health status from gateway health prober
   */
  updateTargetHealth(targetId, isHealthy) {
    const target = this.targets.find(t => t.id === targetId);
    if (target) {
      const changed = target.healthy !== isHealthy;
      target.healthy = isHealthy;
      target.lastChecked = new Date().toISOString();
      if (!isHealthy) {
        target.consecutiveFailures++;
      } else {
        target.consecutiveFailures = 0;
      }
      return changed;
    }
    return false;
  }

  /**
   * Returns current load balancing metrics and distribution summary
   */
  getMetrics() {
    return {
      algorithm: 'Round-Robin',
      totalRequestsRouted: this.totalRequestsRouted,
      activeInstances: this.targets.filter(t => t.healthy).length,
      totalInstances: this.targets.length,
      distribution: this.distributionStats,
      targets: this.targets.map(t => ({
        id: t.id,
        name: t.name,
        port: t.port,
        url: t.url,
        healthy: t.healthy,
        lastChecked: t.lastChecked
      })),
      recentHistory: this.recentRoutingHistory.slice(-10)
    };
  }

  /**
   * Resets counters for new test executions
   */
  resetCounters() {
    this.currentIndex = 0;
    this.totalRequestsRouted = 0;
    this.recentRoutingHistory = [];
    Object.keys(this.distributionStats).forEach(id => {
      this.distributionStats[id].requestCount = 0;
      this.distributionStats[id].percentage = '0.0%';
    });
  }
}

module.exports = RoundRobinLoadBalancer;
