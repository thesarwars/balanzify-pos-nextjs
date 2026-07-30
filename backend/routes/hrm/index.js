/**
 * HRM routes, composed onto one router and mounted at /api/v1/hrm behind
 * requireModule('hrm'). The module order matches the original single-file
 * layout so route resolution is byte-for-byte unchanged.
 */
const express = require('express');

const router = express.Router();

router.use('/', require('./sales-targets'));
router.use('/', require('./employees'));
router.use('/', require('./org'));
router.use('/', require('./holidays'));
router.use('/', require('./settings'));
router.use('/', require('./shifts'));
router.use('/', require('./attendance'));
router.use('/', require('./leave'));
router.use('/', require('./roster'));
router.use('/', require('./advances'));
router.use('/', require('./todos'));
router.use('/', require('./payroll'));

module.exports = router;
