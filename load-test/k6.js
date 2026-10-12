// High-traffic load test for the HPA + database bottleneck demo.
// Run:  k6 run -e BASE_URL=http://<EC2-public-IP> load-test/k6.js
// Short: k6 run -e BASE_URL=... -e PROFILE=smoke load-test/k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

const dbOverloaded = new Counter('db_overloaded_503');
const cacheHits = new Rate('cache_hit_rate');

const profiles = {
  smoke: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 5 },
  ],
  // ~6 minutes: ramp up, hold peak traffic, ramp down
  full: [
    { duration: '1m', target: 100 },
    { duration: '1m', target: 250 },
    { duration: '1m', target: 500 },
    { duration: '2m', target: 500 },
    { duration: '30s', target: 0 },
  ],
};

export const options = {
  stages: profiles[__ENV.PROFILE || 'full'],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/stress`, { tags: { name: 'stress' }, timeout: '10s' });
  if (res.status === 503) dbOverloaded.add(1);
  if (res.status === 200) cacheHits.add(res.json('cached') === true);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random()); // think time: each virtual user is a person, not a flood
}

export function handleSummary(data) {
  const m = data.metrics;
  const line = (label, v) => `${label.padEnd(26)} ${v}\n`;
  const fmt = (x) => (x === undefined ? '-' : Math.round(x));
  const text =
    '\n===== Results (copy into docs/REPORT.md) =====\n' +
    line('Requests', m.http_reqs.values.count) +
    line('Requests/sec', fmt(m.http_reqs.values.rate)) +
    line('Error rate', (m.http_req_failed.values.rate * 100).toFixed(2) + ' %') +
    line('DB overloaded (503)', m.db_overloaded_503 ? m.db_overloaded_503.values.count : 0) +
    line('p95 response time (ms)', fmt(m.http_req_duration.values['p(95)'])) +
    line('Cache hit rate', m.cache_hit_rate ? (m.cache_hit_rate.values.rate * 100).toFixed(1) + ' %' : '-');
  return { stdout: text, [`load-test/results-${__ENV.VARIANT || 'run'}.json`]: JSON.stringify(data, null, 2) };
}
