'use strict';

// Event depositPercent uses the existing API's fractional-ratio contract:
// 0.30 means 30%. Missing values retain the established 30% default.
function parseEventDepositPercent(value) {
  if (value === undefined || value === null) return 0.30;
  const ratio = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return null;
  return ratio;
}

module.exports = { parseEventDepositPercent };
