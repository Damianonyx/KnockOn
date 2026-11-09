import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OWNER_COOKIE, visitorFrom } from '@/server/visitor';

const req = (headers: Record<string, string>) => new Request('https://knockon.test/api/projects', { headers });

describe('visitor identity', () => {
  it('creates a private ID when there is none, and reuses a valid one', () => {
    const first = visitorFrom(req({}));
    assert.ok(first.newToken && first.newToken.length >= 32);
    const again = visitorFrom(req({ cookie: `${OWNER_COOKIE}=${first.newToken}` }));
    assert.equal(again.newToken, undefined);
    assert.equal(again.ownerHash, first.ownerHash);
  });
  it('stores only hashes and ignores malformed cookies', () => {
    const v = visitorFrom(req({ cookie: `${OWNER_COOKIE}=short` }));
    assert.ok(v.newToken);
    assert.match(v.ownerHash, /^[0-9a-f]{64}$/);
    assert.notEqual(v.ownerHash, v.newToken);
  });
  it('hashes the first forwarded address for network limits', () => {
    const a = visitorFrom(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    const b = visitorFrom(req({ 'x-forwarded-for': '203.0.113.7' }));
    assert.equal(a.ipHash, b.ipHash);
    assert.match(a.ipHash, /^[0-9a-f]{64}$/);
  });
});
