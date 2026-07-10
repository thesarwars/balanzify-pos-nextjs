// Re-exports every router the old monolithic combined.js exposed, so
// require('./routes/combined') keeps working unchanged. One file per domain.
module.exports = {
  ...require('./suppliers'),
  ...require('./stock'),
  ...require('./tasks-projects'),
  ...require('./reports'),
  ...require('./users'),
  ...require('./categories'),
  ...require('./locations'),
  ...require('./customers'),
  ...require('./settings'),
  ...require('./expenses'),
  ...require('./customer-groups'),
  ...require('./catalog-refs'),
  ...require('./barcodeSettings'),
  ...require('./discounts'),
  ...require('./invoicing'),
  ...require('./service-types'),
};
