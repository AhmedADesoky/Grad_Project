/**
 * k6 Performance / Load Tests for EWC Writing Coach Backend
 *
 * Run with:
 *   k6 run load_test.js
 *   k6 run --vus 20 --duration 60s load_test.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *
 * Targets:
 *   - AI Backend Classification endpoint (port 8000)
 *   - Node User Backend Exam submission endpoint (port 4000)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ─────────────────────────────────────────────────────────────
const classifyErrorRate = new Rate('classify_errors');
const classifyDuration  = new Trend('classify_duration_ms');
const examErrorRate     = new Rate('exam_errors');
const examDuration      = new Trend('exam_duration_ms');

// ── Test configuration ─────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    classification_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      exec: 'classificationScenario',
    },
    exam_submission_load: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '5s',  // slight offset so both don't hammer at t=0
      exec: 'examSubmissionScenario',
    },
  },
  thresholds: {
    // 95th percentile classification response under 3 seconds
    classify_duration_ms: ['p(95)<3000'],
    // Error rate under 5%
    classify_errors: ['rate<0.05'],
    // Exam submission 95th percentile under 5 seconds
    exam_duration_ms: ['p(95)<5000'],
    exam_errors: ['rate<0.05'],
  },
};

const AI_BACKEND  = __ENV.AI_BACKEND_URL  || 'http://localhost:8000/graphql';
const NODE_BACKEND = __ENV.NODE_BACKEND_URL || 'http://localhost:4000/graphql';

const CLASSIFY_TEXTS = [
  'I have always been interested in learning new languages.',
  'She go to the store yesterday and buyed many things.',
  'The implementation of advanced technology has fundamentally transformed contemporary society.',
  'My cat is sat on the mat.',
  'Despite the numerous challenges faced, the team successfully completed the project on time.',
];

const CLASSIFY_MUTATION = `
  mutation ClassifyText($text: String!) {
    Classify_Text(Text: $text) {
      Success
      Level
      Confidence
      Error
    }
  }
`;

const EXAM_QUESTIONS_QUERY = `
  query {
    Get_Exam_Questions {
      Success
      Questions {
        id
        question
        points
      }
      Error
    }
  }
`;

// ── Scenario: Classification endpoint ─────────────────────────────────────────

export function classificationScenario() {
  const text = CLASSIFY_TEXTS[Math.floor(Math.random() * CLASSIFY_TEXTS.length)];

  const payload = JSON.stringify({
    query: CLASSIFY_MUTATION,
    variables: { text },
  });

  group('Classification', () => {
    const start = Date.now();
    const res = http.post(AI_BACKEND, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    classifyDuration.add(Date.now() - start);

    const ok = check(res, {
      'status is 200': (r) => r.status === 200,
      'no HTTP error': (r) => r.status < 500,
      'has data field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return 'data' in body || 'errors' in body;
        } catch { return false; }
      },
    });

    classifyErrorRate.add(!ok);
  });

  sleep(1);
}

// ── Scenario: Exam Submission endpoint ────────────────────────────────────────

export function examSubmissionScenario() {
  group('Exam Questions (unauthenticated gate)', () => {
    const start = Date.now();
    const res = http.post(NODE_BACKEND, JSON.stringify({ query: EXAM_QUESTIONS_QUERY }), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });
    examDuration.add(Date.now() - start);

    const ok = check(res, {
      'status is 200': (r) => r.status === 200,
      'responds with JSON': (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
    });

    examErrorRate.add(!ok);
  });

  sleep(2);
}

// ── Smoke test (default scenario if no options set) ───────────────────────────

export default function () {
  group('Smoke — AI Backend reachable', () => {
    const res = http.post(AI_BACKEND,
      JSON.stringify({ query: '{ __typename }' }),
      { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
    );
    check(res, {
      'AI backend responds': (r) => r.status === 200,
    });
  });

  group('Smoke — Node Backend reachable', () => {
    const res = http.post(NODE_BACKEND,
      JSON.stringify({ query: '{ __typename }' }),
      { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
    );
    check(res, {
      'Node backend responds': (r) => r.status === 200,
    });
  });

  sleep(1);
}
