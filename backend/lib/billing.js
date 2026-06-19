/**
 * Module billing — pluggable payment providers for paid add-on subscriptions.
 * Stripe is the first provider; African rails (Zaad, EVC, M-Pesa, …) can be
 * added here later. Billing is OPTIONAL: a superadmin can enable modules for
 * free, and self-serve checkout only appears when a provider is configured.
 */
const { modulePrice } = require('./modules');

let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// The billing providers currently available on this deployment.
function providers() {
  const list = [];
  if (process.env.STRIPE_SECRET_KEY) list.push({ id: 'stripe', name: 'Card (Stripe)' });
  return list;
}
const hasProvider = (id) => providers().some((p) => p.id === id);

module.exports = { getStripe, providers, hasProvider, modulePrice };
