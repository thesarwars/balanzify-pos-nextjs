// Hotel module router — one file per area, composed here. Mounted at
// /api/v1/hotel behind requireModule('hotel') in server.js. Shared schemas and
// helpers live in ./_shared.
const express = require('express');

const router = express.Router();
router.use('/', require('./rooms'));
router.use('/', require('./reservations'));
router.use('/', require('./folios'));
router.use('/', require('./corporate'));
router.use('/', require('./groups'));
router.use('/', require('./operations'));
router.use('/', require('./settings'));

module.exports = router;
