'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('transit and hub journey planning routes mount on distinct paths', () => {
  const express = {
    Router() {
      const routes = [];
      const router = { routes };
      for (const method of ['get','post','put','patch','delete']) {
        router[method] = (path, ...handlers) => {
          routes.push({ method: method.toUpperCase(), path, handlers });
          return router;
        };
      }
      return router;
    },
  };
  const { createTransitRouter } = require('./transitRoutes');
  const { createTransitHubRouter } = require('./transitHubRoutes');
  const dependencies = {
    express,
    db: {},
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } },
    requireAuth: (_req,_res,next) => next && next(),
    fail: () => {},
    ok: () => {},
    sanitize: (value) => String(value ?? '').trim(),
  };
  const transit = createTransitRouter(dependencies);
  const hub = createTransitHubRouter(dependencies);
  assert.equal(transit.routes.filter(r => r.method === 'POST' && r.path === '/journeys/plan').length, 1);
  assert.equal(hub.routes.filter(r => r.method === 'POST' && r.path === '/hub/journeys/plan').length, 1);
  assert.equal(hub.routes.filter(r => r.method === 'POST' && r.path === '/journeys/plan').length, 0);
  const mounted = [...transit.routes, ...hub.routes].map(r => r.method + ' /transit' + r.path);
  assert.equal(new Set(mounted).size, mounted.length);
});
