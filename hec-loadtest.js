// k6 HEC Load Test for Lumi
// Run: k6 run hec-loadtest.js

import http from 'k6/http';
import { check, sleep } from 'k6';

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users over 30s
    { duration: '2m', target: 50 },    // Ramp to 50 users over 2 minutes
    { duration: '5m', target: 50 },    // Stay at 50 users for 5 minutes
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Less than 1% errors
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
  },
};

// HEC endpoint configuration
const HEC_URL = 'https://splunk-hec.lumi-ent-v1.dev.imply.io/services/collector';
const HEC_TOKEN = 'b4c4caa1-6c05-4174-84d8-f4a925790ba5';

// Event templates with different log types
const eventTemplates = [
  {
    level: 'INFO',
    message: 'User authentication successful',
    service: 'auth-service',
    action: 'login',
    result: 'success',
  },
  {
    level: 'ERROR',
    message: 'Database connection timeout',
    service: 'database',
    error_code: 'DB_TIMEOUT',
    query_time_ms: () => Math.floor(Math.random() * 3000) + 3000,
    retry_count: () => Math.floor(Math.random() * 3) + 1,
  },
  {
    level: 'WARN',
    message: 'High memory usage detected',
    service: 'monitoring',
    memory_pct: () => Math.floor(Math.random() * 20) + 75,
    cpu_pct: () => Math.floor(Math.random() * 30) + 60,
    threshold_exceeded: true,
  },
  {
    level: 'INFO',
    message: 'API request processed',
    service: 'api-gateway',
    endpoint: () => ['/api/v1/users', '/api/v1/orders', '/api/v1/products'][Math.floor(Math.random() * 3)],
    method: 'GET',
    status_code: 200,
    response_time_ms: () => Math.floor(Math.random() * 500),
  },
  {
    level: 'DEBUG',
    message: 'Cache operation completed',
    service: 'cache-service',
    cache_key: () => `user:session:${Math.floor(Math.random() * 10000)}`,
    operation: () => ['GET', 'SET', 'DELETE'][Math.floor(Math.random() * 3)],
    backend: 'redis',
    ttl_seconds: 3600,
  },
  {
    level: 'ERROR',
    message: 'Payment processing failed',
    service: 'payment-service',
    error_code: 'PAYMENT_DECLINED',
    amount: () => (Math.random() * 1000).toFixed(2),
    currency: 'USD',
    retry_allowed: true,
  },
  {
    level: 'INFO',
    message: 'Order created successfully',
    service: 'order-service',
    order_id: () => `ORD-${Math.floor(Math.random() * 1000000)}`,
    items_count: () => Math.floor(Math.random() * 10) + 1,
    total_amount: () => (Math.random() * 5000).toFixed(2),
  },
  {
    level: 'WARN',
    message: 'Rate limit approaching threshold',
    service: 'api-gateway',
    client_id: () => `client-${Math.floor(Math.random() * 100)}`,
    current_requests: () => Math.floor(Math.random() * 200) + 800,
    limit: 1000,
    window_seconds: 60,
  },
];

// Service names for host field
const services = ['web-01', 'web-02', 'api-01', 'api-02', 'worker-01', 'worker-02'];

// Generate a single event
function generateEvent() {
  // Random timestamp within last 7 days (events >3 days old will test slow lane routing)
  const daysAgo = Math.random() * 7;
  const timestamp = Math.floor(Date.now() / 1000) - Math.floor(daysAgo * 86400);

  // Pick random event template
  const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];

  // Build event data by evaluating functions
  const eventData = {};
  for (const [key, value] of Object.entries(template)) {
    eventData[key] = typeof value === 'function' ? value() : value;
  }

  // Add common fields
  eventData.timestamp = new Date(timestamp * 1000).toISOString();
  eventData.user_id = `user-${Math.floor(Math.random() * 10000)}`;
  eventData.request_id = `req-${Math.random().toString(36).substring(7)}`;

  // HEC payload format
  // Key attributes for Lumi processing:
  // - time: Unix epoch (for historical data)
  // - source: Origin of the logs
  // - sourcetype: Type/format of logs
  // - index: Which index to store in
  // - host: Service/host identifier
  const payload = {
    time: timestamp,
    event: eventData,
    source: 'k6-loadtest',
    sourcetype: 'application:json',
    index: 'main',
    host: services[Math.floor(Math.random() * services.length)],
  };

  return payload;
}

// Main test function - executed by each virtual user
export default function () {
  const payload = generateEvent();

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Splunk ${HEC_TOKEN}`,
    },
  };

  const response = http.post(HEC_URL, JSON.stringify(payload), params);

  // Verify response
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response has success': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.code === 0 && body.text === 'Success';
      } catch (e) {
        return false;
      }
    },
  });

  // Small delay between requests from each user
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}
