const PLANS = Object.freeze({
  Annual: Object.freeze({ amount: 710000, currency: 'IRT' }),
});

function getPlan(name) {
  return Object.prototype.hasOwnProperty.call(PLANS, name) ? PLANS[name] : null;
}

module.exports = { PLANS, getPlan };
