import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUserLinks } from './link-service.js';

const mockRows = [
  { id: 1, short_code: 'abc123', user_id: 42, url: 'https://example.com', created_at: new Date() },
  { id: 2, short_code: 'xyz789', user_id: 42, url: 'https://other.com', created_at: new Date() },
];

const mockPool = {
  query: async () => ({ rows: mockRows }),
};

test('getUserLinks gibt Result-Objekt mit Links zurück', async () => {
  const result = await getUserLinks(mockPool, 42);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, mockRows);
});

test('getUserLinks gibt leeres Array zurück wenn keine Links vorhanden', async () => {
  const emptyPool = { query: async () => ({ rows: [] }) };

  const result = await getUserLinks(emptyPool, 99);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, []);
});

test('getUserLinks Result hat die erwartete Struktur', async () => {
  const result = await getUserLinks(mockPool, 42);

  assert.ok('success' in result, 'Result muss success-Feld haben');
  assert.ok('data' in result, 'Result muss data-Feld haben');
  assert.equal(typeof result.success, 'boolean');
  assert.ok(Array.isArray(result.data));
});
