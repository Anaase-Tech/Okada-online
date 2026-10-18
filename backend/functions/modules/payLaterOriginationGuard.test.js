'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPayLaterOriginationSuspension, PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE } = require('./payLaterOriginationGuard');

function response() { return { statusCode:null, body:null, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} }; }

test('direct Pay Later origination is rejected before the transaction handler runs', () => {
  let nextCalls = 0;
  const state = { debtRecords:[{id:'existing',status:'deferred',amount:25}], payLaterUsed:25, ridePaymentStatus:'PENDING' };
  const fail = (res, code, message) => res.status(code).json({error:message});
  const middleware = createPayLaterOriginationSuspension({fail});
  const res = response();
  const result = middleware({uid:'passenger-1',body:{userId:'passenger-1',rideId:'new-ride',amount:45}},res,()=>{
    nextCalls++; state.debtRecords.push({id:'new',status:'deferred',amount:45}); state.payLaterUsed+=45; state.ridePaymentStatus='DEFERRED';
  });
  assert.equal(result.statusCode,409);
  assert.equal(result.body.error,PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE);
  assert.equal(result.body.ok,undefined);
  assert.equal(result.body.accepted,undefined);
  assert.equal(result.body.amountDeferred,undefined);
  assert.equal(nextCalls,0);
  assert.deepEqual(state,{debtRecords:[{id:'existing',status:'deferred',amount:25}],payLaterUsed:25,ridePaymentStatus:'PENDING'});
});

test('origination suspension has no database writer operations', () => {
  const fail = (res, code, message) => res.status(code).json({error:message});
  const middleware = createPayLaterOriginationSuspension({fail});
  assert.equal(middleware.length,2);
  assert.doesNotMatch(String(middleware),/db\.collection|runTransaction|trx\.set|trx\.update|FieldValue\.increment/);
});

test('suspension message promises no change to existing debts and deferred rides', () => {
  assert.match(PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE,/Existing deferred rides and outstanding balances are unchanged/);
});
