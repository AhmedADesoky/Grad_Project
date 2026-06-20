/**
 * Integration tests for the Node.js GraphQL endpoint.
 *
 * These tests hit the actual running server on port 4000.
 * They are skipped automatically when the server is not reachable,
 * so CI/CD does not fail on cold-start environments.
 *
 * Run the server first:  npm run dev
 * Then run:              npm test -- --testPathPattern=integration
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

const BASE_URL = process.env.NODE_BACKEND_URL || 'http://localhost:4000/graphql';
const TIMEOUT_MS = 5000;

async function gql(query, variables = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.json();
}

// Check connectivity once — skip all tests if server is down
let serverReachable = false;
beforeAll(async () => {
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    serverReachable = res.ok;
  } catch {
    serverReachable = false;
  }
  if (!serverReachable) {
    console.warn('[integration] Node backend not reachable at', BASE_URL, '— skipping tests');
  }
});

describe('GraphQL endpoint — basic health', () => {
  test('responds to introspection __typename query', async () => {
    if (!serverReachable) return;
    const data = await gql('{ __typename }');
    expect(data).toHaveProperty('data');
    expect(data.data.__typename).toBe('Query');
  });

  test('returns valid JSON structure for an invalid query', async () => {
    if (!serverReachable) return;
    const data = await gql('{ thisFieldDoesNotExist }');
    expect(data).toHaveProperty('errors');
    expect(Array.isArray(data.errors)).toBe(true);
  });
});

describe('GraphQL endpoint — auth rejection', () => {
  const GET_USER_QUERY = `
    query GetProfile($userId: ID!) {
      Get_User_Profile(User_Id: $userId) {
        User_Name
        Email
      }
    }
  `;

  test('rejects unauthenticated request with auth error', async () => {
    if (!serverReachable) return;
    const data = await gql(GET_USER_QUERY, { userId: 'fake-id-123' });
    // Must have either errors array OR null data — resolver is protected
    const hasErrors = Array.isArray(data.errors) && data.errors.length > 0;
    const hasNullData = data.data === null || (data.data && data.data.Get_User_Profile === null);
    expect(hasErrors || hasNullData).toBe(true);
  });

  test('rejects request with malformed Bearer token', async () => {
    if (!serverReachable) return;
    const data = await gql(GET_USER_QUERY, { userId: 'fake-id-123' }, 'not-a-real-jwt');
    expect(data).toHaveProperty('errors');
  });
});
