'use strict';

const breakers = new Map();

class CircuitBreaker {
  constructor(name, { failureThreshold = 5, resetTimeoutMs = 30000, fallback } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.fallback = fallback;
    this.failures = 0;
    this.state = 'CLOSED';
    this.nextAttempt = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        if (this.fallback) return this.fallback();
        const err = new Error(`Circuit breaker [${this.name}] aberto. Aguarde ${Math.ceil((this.nextAttempt - Date.now()) / 1000)}s.`);
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  _onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
    }
  }
}

function getBreaker(name, opts = {}) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, opts));
  }
  return breakers.get(name);
}

module.exports = { getBreaker, CircuitBreaker };
