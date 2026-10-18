'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPayLaterRepaymentHandler,
  REPAYMENT_UNAVAILABLE_MESSAGE,
} = require('./payLaterRepaymentGuard');

function createHarness({ profileExists = true } = {}) {
  const writes = [];
  const userRef = {
    id: 'user-1',
    update(...args) { writes.push({ type: 'user.update', args }); },
    set(...args) { writes.push({ type: 'user.set', args }); },
  };
  const resolveCalls = [];
  const resolveUserRef = async (userId, req) => {
    resolveCalls.push({ userId, uid: req.uid });
    return profileExists ? { ref: userRef, data: { payLater: { used: 40, suspended: false } } } : null;
  };
  const fail = (res, code, message) => res.status(code).json({ error: message });
  const handler = createPayLaterRepaymentHandler({ resolveUserRef, fail });
  const makeResponse = () => ({
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  return { handler, writes, resolveCalls, makeResponse };
}

for (const [name, body] of [
  ['aggregate amount', { userId: 'user-1', amount: 40 }],
  ['specific debt record', { userId: 'user-1', payLaterTxId: 'pl-123' }],
]) {
  test(`Pay Later ${name} repayment is rejected without debt or limit writes`, async () => {
    const h = createHarness();
    const req = { uid: 'user-1', body };
    const res = h.makeResponse();
    const result = await h.handler(req, res);

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error, REPAYMENT_UNAVAILABLE_MESSAGE);
    assert.equal(result.body.ok, undefined);
    assert.equal(result.body.repaid, undefined);
    assert.equal(result.body.status, undefined);
    assert.match(result.body.error, /cannot verify an incoming payment/i);
    assert.match(result.body.error, /No debt records or Pay Later limit were changed/i);
    assert.equal(h.writes.length, 0);
    assert.equal(h.resolveCalls.length, 1);
  });
}

test('Pay Later aggregate repayment still rejects malformed amounts without writes', async () => {
  const h = createHarness();
  const res = h.makeResponse();
  const result = await h.handler({ uid: 'user-1', body: { userId: 'user-1', amount: 0 } }, res);

  assert.equal(result.statusCode, 400);
  assert.match(result.body.error, /positive repayment amount/i);
  assert.equal(h.writes.length, 0);
});

test('Pay Later repayment preserves profile authorization failure and makes no writes', async () => {
  const h = createHarness({ profileExists: false });
  const res = h.makeResponse();
  const result = await h.handler({ uid: 'user-1', body: { userId: 'other-user', amount: 40 } }, res);

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error, 'User not found');
  assert.equal(h.writes.length, 0);
});
