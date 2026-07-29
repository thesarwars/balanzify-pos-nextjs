// Reports router — one module per report, composed here. Each module registers
// its routes on its own express.Router and this mounts them all under
// /api/v1/reports. Shared helpers live in ./_shared.
const express = require('express');

const reportsRouter = express.Router();
reportsRouter.use('/', require('./core'));
reportsRouter.use('/', require('./profit-loss'));
reportsRouter.use('/', require('./purchase-sale'));
reportsRouter.use('/', require('./customer-groups'));
reportsRouter.use('/', require('./stock'));
reportsRouter.use('/', require('./stock-adjustment'));
reportsRouter.use('/', require('./trending-products'));
reportsRouter.use('/', require('./items'));
reportsRouter.use('/', require('./product-purchase'));
reportsRouter.use('/', require('./product-sell'));
reportsRouter.use('/', require('./purchase-sale-product'));
reportsRouter.use('/', require('./payments'));
reportsRouter.use('/', require('./expenses'));
reportsRouter.use('/', require('./registers'));
reportsRouter.use('/', require('./sales-rep'));
reportsRouter.use('/', require('./activity-log'));
reportsRouter.use('/', require('./contacts'));
reportsRouter.use('/', require('./tax'));

module.exports = { reportsRouter };
