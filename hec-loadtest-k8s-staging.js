// k6 HEC Load Test for Lumi Staging
// Run: k6 run --vus=1000 --duration=1h hec-loadtest-k8s-staging.js

import http from 'k6/http';
import { check, sleep } from 'k6';

// VUs and duration controlled by CLI args in k8s deployment
export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Less than 1% errors
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
  },
};

// HEC endpoint configuration - Staging
const HEC_URL = 'https://splunk-hec.lumi-ent-v1.staging.imply.io/services/collector';
// HEC token from staging integration: Lumi UI > Integrations > HEC > Keys
const HEC_TOKEN = __ENV.HEC_TOKEN || 'REPLACE_WITH_STAGING_HEC_TOKEN';

// Email domains for redaction testing
const emailDomains = ['example.com', 'company.org', 'internal.net', 'corp.io', 'staging.dev'];
const emailUsers = ['admin', 'ops', 'billing', 'support', 'alerts', 'devops', 'security', 'sre'];

function randomEmail() {
  const user = emailUsers[Math.floor(Math.random() * emailUsers.length)];
  const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
  return `${user}@${domain}`;
}

function randomIP() {
  const subnets = ['10.0', '172.16', '192.168', '10.1', '172.31'];
  const subnet = subnets[Math.floor(Math.random() * subnets.length)];
  return `${subnet}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Event templates - designed to exercise staging pipelines:
//   - Value Mapper: adds index_time, overrides host
//   - Redaction: hashes user IDs, redacts emails and IPs
const eventTemplates = [
  {
    level: 'INFO',
    message: () => `User authentication successful from ${randomIP()} contact ${randomEmail()}`,
    service: 'auth-service',
    action: 'login',
    result: 'success',
  },
  {
    level: 'ERROR',
    message: () => `Database connection timeout from ${randomIP()} reported to ${randomEmail()} after ${Math.floor(Math.random() * 3000) + 3000}ms`,
    service: 'database',
    error_code: 'DB_TIMEOUT',
    retry_count: () => Math.floor(Math.random() * 3) + 1,
  },
  {
    level: 'WARN',
    message: () => `High memory usage detected on ${randomIP()} alert sent to ${randomEmail()} memory=${Math.floor(Math.random() * 20) + 75}%`,
    service: 'monitoring',
    threshold_exceeded: true,
  },
  {
    level: 'INFO',
    message: () => {
      const endpoint = ['/api/v1/users', '/api/v1/orders', '/api/v1/products'][Math.floor(Math.random() * 3)];
      return `API request processed ${endpoint} from ${randomIP()} by ${randomEmail()} status=200 latency=${Math.floor(Math.random() * 500)}ms`;
    },
    service: 'api-gateway',
    method: 'GET',
    status_code: 200,
  },
  {
    level: 'DEBUG',
    message: () => `Cache operation completed key=user:session:${Math.floor(Math.random() * 10000)} from ${randomIP()} op=${['GET', 'SET', 'DELETE'][Math.floor(Math.random() * 3)]}`,
    service: 'cache-service',
    backend: 'redis',
    ttl_seconds: 3600,
  },
  {
    level: 'ERROR',
    message: () => `Payment processing failed for $${(Math.random() * 1000).toFixed(2)} from ${randomIP()} notify ${randomEmail()} error_code=PAYMENT_DECLINED`,
    service: 'payment-service',
    error_code: 'PAYMENT_DECLINED',
    currency: 'USD',
    retry_allowed: true,
  },
  {
    level: 'INFO',
    message: () => `Order ORD-${Math.floor(Math.random() * 1000000)} created from ${randomIP()} confirmation sent to ${randomEmail()} items=${Math.floor(Math.random() * 10) + 1}`,
    service: 'order-service',
  },
  {
    level: 'WARN',
    message: () => `Rate limit approaching threshold from ${randomIP()} client ${randomEmail()} requests=${Math.floor(Math.random() * 200) + 800}/1000`,
    service: 'api-gateway',
    window_seconds: 60,
  },
];

// Realistic service hostnames
const hosts = [
  'auth-service-prod-01',
  'auth-service-prod-02',
  'api-gateway-prod-01',
  'api-gateway-prod-02',
  'database-primary',
  'database-replica-01',
  'cache-redis-01',
  'cache-redis-02',
  'payment-service-01',
  'order-service-01',
  'monitoring-collector-01',
];

// Generate a single event
function generateEvent() {
  // Random timestamp within last 7 days
  const daysAgo = Math.random() * 7;
  const timestamp = Math.floor(Date.now() / 1000) - Math.floor(daysAgo * 86400);

  const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];

  const eventData = {};
  for (const [key, value] of Object.entries(template)) {
    eventData[key] = typeof value === 'function' ? value() : value;
  }

  // Common fields - user_id will be hashed by redaction pipeline
  eventData.timestamp = new Date(timestamp * 1000).toISOString();
  eventData.user_id = `user-${Math.floor(Math.random() * 10000)}`;
  eventData.request_id = `req-${Math.random().toString(36).substring(7)}`;

  return {
    time: timestamp,
    event: eventData,
    source: 'k6-loadtest',
    sourcetype: 'application:json',
    index: 'main',
    host: hosts[Math.floor(Math.random() * hosts.length)],
  };
}

// Main test function
export default function () {
  const payload = generateEvent();

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Splunk ${HEC_TOKEN}`,
    },
  };

  const response = http.post(HEC_URL, JSON.stringify(payload), params);

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

  // 0.1s sleep = ~10 req/sec per VU
  sleep(0.1);
}
