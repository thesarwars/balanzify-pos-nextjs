/**
 * Credit, Payment Plans & Diaspora Payment Routes
 *
 * Credit Ledger:
 *   GET  /api/v1/credit/customers/:id/statement    — full ledger statement
 *   GET  /api/v1/credit/customers/:id/balance      — current balance
 *   POST /api/v1/credit/customers/:id/statement/whatsapp — send statement via WhatsApp
 *
 * Payment Plans:
 *   GET  /api/v1/credit/plans                      — list all plans
 *   POST /api/v1/credit/plans                      — create a plan
 *   GET  /api/v1/credit/plans/:id                  — plan with installments
 *   PUT  /api/v1/credit/plans/:id                  — update plan
 *   POST /api/v1/credit/plans/:id/installments/:iid/pay — record installment payment
 *   GET  /api/v1/credit/plans/overdue              — overdue installments
 *   POST /api/v1/credit/plans/reminders            — send WhatsApp reminders for due installments
 *
 * Diaspora Payments:
 *   POST /api/v1/credit/plans/:id/installments/:iid/diaspora-link — generate payment link
 *   GET  /api/v1/pay/:token                        — public payment page (no auth)
 *   POST /api/v1/pay/:token/charge                 — payer submits payment
 *
 * Settlement Providers:
 *   GET  /api/v1/credit/settlement/providers       — list providers
 *   POST /api/v1/credit/settlement/providers       — add provider (admin)
 *   GET  /api/v1/credit/settlement/accounts        — merchant's accounts
 *   POST /api/v1/credit/settlement/accounts        — link account
 */

const express = require('express');
const { z }   = require('zod');
const crypto  = require('crypto');
const prisma  = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate }          = require('../middleware/validate');
const creditEngine          = require('../lib/credit');
const registry              = require('../lib/payments');
const { convert }           = require('../lib/currency');
const webhooks              = require('../lib/webhooks');
const { logger }            = require('../lib/logger');
const router = express.Router();

const uuid  = z.string().uuid();
const money = z.coerce.number().nonnegative().multipleOf(0.01);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── CREDIT LEDGER ─────────────────────────────────────────────────

// GET /api/v1/credit/customers/:id/statement
router.get('/customers/:id/statement', auth, async (req, res, next) => {
  try {
    const { from, to, limit } = req.query;

    // Verify customer belongs to this business
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!customer) return res.status(404).json({ title: 'Customer not found', status: 404 });

    const statement = await creditEngine.getStatement(req.params.id, req.user.business_id, {
      from,
      to,
      limit: parseInt(limit) || 100,
    });

    res.json(statement);
  } catch (err) { next(err); }
});

// GET /api/v1/credit/customers/:id/balance
router.get('/customers/:id/balance', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      select: { id: true, name: true, outstandingBalance: true, creditLimit: true, currency: true },
    });
    if (!customer) return res.status(404).json({ title: 'Not found', status: 404 });

    // Get ledger balance as authoritative source
    const ledgerBalance = await creditEngine.getLedgerBalance(req.params.id, req.user.business_id);

    res.json({
      customer_id:       customer.id,
      name:              customer.name,
      outstanding_balance: ledgerBalance,
      credit_limit:      parseFloat(customer.creditLimit),
      available_credit:  parseFloat(customer.creditLimit) - ledgerBalance,
      currency:          customer.currency || req.user.currency || 'USD',
    });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/customers/:id/statement/whatsapp
// Send customer their account statement via WhatsApp
router.post('/customers/:id/statement/whatsapp', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const phone = req.body.phone || customer.whatsapp || customer.phone;
    if (!phone) return res.status(400).json({ error: 'No WhatsApp number on file. Provide phone in body.' });

    const business = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    const statement = await creditEngine.getStatement(req.params.id, req.user.business_id, { limit: 10 });
    const message   = creditEngine.formatWhatsAppStatement(statement, business?.name, business?.currency || 'USD');

    const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '');
    const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;

    await prisma.whatsappLog.create({
      data: {
        businessId:    req.user.business_id,
        recipientPhone: normalizedPhone,
        messageType:   'credit_statement',
        content:       message,
        referenceType: 'customer',
        referenceId:   req.params.id,
      },
    });

    res.json({ wa_url: waUrl, message_preview: message.slice(0, 200) + '...' });
  } catch (err) { next(err); }
});

// ── PAYMENT PLANS ─────────────────────────────────────────────────

// GET /api/v1/credit/plans
router.get('/plans', auth, async (req, res, next) => {
  try {
    const { status, customer_id } = req.query;
    const plans = await prisma.paymentPlan.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status      && { status }),
        ...(customer_id && { customerId: customer_id }),
      },
      include: {
        customer: { select: { name: true, phone: true, whatsapp: true } },
        items: {
          orderBy: { installmentNo: 'asc' },
          select: { id: true, installmentNo: true, dueDate: true, amount: true, amountPaid: true, status: true },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Compute summary per plan
    const enriched = plans.map(p => ({
      ...p,
      paid_installments:    p.items.filter(i => i.status === 'paid').length,
      overdue_installments: p.items.filter(i => i.status === 'overdue' || (i.status === 'pending' && new Date(i.dueDate) < new Date())).length,
      total_paid:           p.items.reduce((s, i) => s + parseFloat(i.amountPaid), 0),
      remaining:            parseFloat(p.balanceAmount) - p.items.reduce((s, i) => s + parseFloat(i.amountPaid), 0),
    }));

    res.json({ plans: enriched });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/plans
router.post('/plans', auth, requireRole('owner', 'manager'), validate(z.object({
  customerId:   uuid,
  saleId:       uuid.optional().nullable(),
  description:  z.string().trim().min(1).max(255),
  totalAmount:  money.refine(v => v > 0),
  downPayment:  money.default(0),
  installments: z.coerce.number().int().min(2).max(60),
  frequency:    z.enum(['weekly','monthly','custom']).default('monthly'),
  startDate:    isoDate,
  currency:     z.string().length(3).default('USD'),
  diasporaEnabled: z.boolean().default(true),
  reminderDaysBefore: z.coerce.number().int().min(0).max(30).default(3),
  notes:        z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const {
      customerId, saleId, description, totalAmount, downPayment,
      installments, frequency, startDate, currency, diasporaEnabled,
      reminderDaysBefore, notes,
    } = req.body;

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: req.user.business_id },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const balanceAmount = parseFloat(totalAmount) - parseFloat(downPayment);
    const installmentAmount = parseFloat((balanceAmount / installments).toFixed(2));

    // Build installment schedule
    const schedule = [];
    const start = new Date(startDate);

    for (let i = 1; i <= installments; i++) {
      const dueDate = new Date(start);
      if (frequency === 'weekly')  dueDate.setDate(dueDate.getDate() + (i * 7));
      if (frequency === 'monthly') dueDate.setMonth(dueDate.getMonth() + i);
      if (frequency === 'custom')  dueDate.setDate(dueDate.getDate() + (i * 30));

      // Last installment absorbs rounding difference
      const amount = i === installments
        ? parseFloat((balanceAmount - (installmentAmount * (installments - 1))).toFixed(2))
        : installmentAmount;

      schedule.push({ installmentNo: i, dueDate, amount, currency });
    }

    const plan = await prisma.$transaction(async (tx) => {
      const planNum = `PLN-${Date.now().toString().slice(-8)}`;

      const p = await tx.paymentPlan.create({
        data: {
          businessId:        req.user.business_id,
          customerId,
          saleId:            saleId || null,
          planNumber:        planNum,
          description,
          totalAmount,
          downPayment,
          balanceAmount,
          currency,
          installments,
          frequency,
          status:            'active',
          startDate:         new Date(startDate),
          endDate:           schedule[schedule.length - 1].dueDate,
          diasporaEnabled,
          reminderDaysBefore,
          notes:             notes || null,
          createdById:       req.user.id,
          items: {
            create: schedule.map(s => ({
              businessId: req.user.business_id,
              customerId,
              ...s,
              paymentToken: creditEngine.generatePaymentToken(),
            })),
          },
        },
        include: { items: { orderBy: { installmentNo: 'asc' } } },
      });

      // Record down payment in credit ledger if > 0
      if (parseFloat(downPayment) > 0) {
        await creditEngine.postDebit(tx, {
          businessId:  req.user.business_id,
          customerId,
          amount:      balanceAmount, // Only the balance, not the down payment
          currency,
          saleId:      saleId || null,
          description: `Payment plan ${planNum} — ${description}`,
          recordedById: req.user.id,
        });
      } else {
        await creditEngine.postDebit(tx, {
          businessId:  req.user.business_id,
          customerId,
          amount:      totalAmount,
          currency,
          saleId:      saleId || null,
          description: `Payment plan ${planNum} — ${description}`,
          recordedById: req.user.id,
        });
      }

      return p;
    });

    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// GET /api/v1/credit/plans/:id
router.get('/plans/:id', auth, async (req, res, next) => {
  try {
    const plan = await prisma.paymentPlan.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        customer: { select: { name: true, phone: true, whatsapp: true } },
        sale:     { select: { saleNumber: true, totalAmount: true } },
        items:    { orderBy: { installmentNo: 'asc' } },
      },
    });
    if (!plan) return res.status(404).json({ title: 'Plan not found', status: 404 });

    // Mark overdue items
    const now = new Date();
    const items = plan.items.map(i => ({
      ...i,
      is_overdue: i.status === 'pending' && new Date(i.dueDate) < now,
      days_overdue: i.status === 'pending' && new Date(i.dueDate) < now
        ? Math.floor((now - new Date(i.dueDate)) / 86400000)
        : 0,
    }));

    res.json({ ...plan, items });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/plans/:id/installments/:iid/pay
// Record payment against a specific installment
router.post('/plans/:id/installments/:iid/pay', auth, validate(z.object({
  amount:         money.refine(v => v > 0),
  payment_method: z.string().default('cash'),
  reference:      z.string().max(255).optional().nullable(),
  notes:          z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const item = await prisma.paymentPlanItem.findFirst({
      where: { id: req.params.iid, planId: req.params.id, businessId: req.user.business_id },
      include: { plan: { select: { customerId: true, currency: true, planNumber: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Installment not found.' });
    if (item.status === 'paid') return res.status(400).json({ error: 'This installment is already paid.' });

    const { amount, payment_method, reference, notes } = req.body;
    const newAmountPaid = parseFloat(item.amountPaid) + parseFloat(amount);
    const newStatus     = newAmountPaid >= parseFloat(item.amount) ? 'paid' : 'partial';

    await prisma.$transaction(async (tx) => {
      // Update installment
      await tx.paymentPlanItem.update({
        where: { id: req.params.iid },
        data: {
          amountPaid:    newAmountPaid,
          status:        newStatus,
          paidAt:        newStatus === 'paid' ? new Date() : null,
          paymentMethod: payment_method,
          reference:     reference || null,
        },
      });

      // Post to credit ledger
      await creditEngine.postRepayment(tx, {
        businessId:    req.user.business_id,
        customerId:    item.plan.customerId,
        amount:        parseFloat(amount),
        currency:      item.currency || item.plan.currency || 'USD',
        paymentMethod: payment_method,
        reference:     reference || null,
        planItemId:    item.id,
        description:   notes || `Installment #${item.installmentNo} — Plan ${item.plan.planNumber}`,
        recordedById:  req.user.id,
      });

      // Check if all installments paid — complete the plan
      const allItems = await tx.paymentPlanItem.findMany({ where: { planId: req.params.id } });
      const allPaid  = allItems.every(i => i.id === req.params.iid ? newStatus === 'paid' : i.status === 'paid');
      if (allPaid) {
        await tx.paymentPlan.update({ where: { id: req.params.id }, data: { status: 'completed' } });
      }
    });

    res.json({
      message:        `Installment ${newStatus === 'paid' ? 'fully paid' : 'partially paid'}.`,
      amount_paid:    newAmountPaid,
      amount_due:     parseFloat(item.amount),
      status:         newStatus,
    });
  } catch (err) {
    if (err.code === 'EXCEEDS_BALANCE') return res.status(400).json({ error: err.message });
    next(err);
  }
});

// GET /api/v1/credit/plans/overdue — installments past due date
router.get('/plans/overdue', auth, async (req, res, next) => {
  try {
    const overdue = await prisma.paymentPlanItem.findMany({
      where: {
        businessId: req.user.business_id,
        status:     { in: ['pending', 'partial'] },
        dueDate:    { lt: new Date() },
      },
      include: {
        plan:     { select: { planNumber: true, description: true } },
        customer: { select: { name: true, phone: true, whatsapp: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    res.json({
      overdue: overdue.map(i => ({
        ...i,
        days_overdue: Math.floor((new Date() - new Date(i.dueDate)) / 86400000),
        amount_remaining: parseFloat(i.amount) - parseFloat(i.amountPaid),
      })),
      total_overdue_amount: overdue.reduce((s, i) => s + parseFloat(i.amount) - parseFloat(i.amountPaid), 0),
    });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/plans/reminders — send WhatsApp reminders
router.post('/plans/reminders', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const today    = new Date(); today.setHours(0,0,0,0);
    const in3Days  = new Date(today.getTime() + 3 * 86400000);

    // Find installments due within 3 days or overdue
    const due = await prisma.paymentPlanItem.findMany({
      where: {
        businessId: req.user.business_id,
        status:     { in: ['pending', 'partial'] },
        dueDate:    { lte: in3Days },
      },
      include: {
        plan:     { select: { planNumber: true, description: true } },
        customer: { select: { name: true, phone: true, whatsapp: true } },
      },
    });

    const sent = [];
    const business = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { name: true, currency: true } });

    for (const item of due) {
      const phone = item.customer.whatsapp || item.customer.phone;
      if (!phone) continue;

      const isOverdue = new Date(item.dueDate) < today;
      const daysUntil = Math.ceil((new Date(item.dueDate) - today) / 86400000);
      const remaining = parseFloat(item.amount) - parseFloat(item.amountPaid);
      const currency  = business?.currency || 'USD';

      let msg = isOverdue
        ? `⚠️ *Payment Overdue*\n\nDear ${item.customer.name},\n\nYour installment of ${currency} ${remaining.toFixed(2)} for ${item.plan.description} was due on ${new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.\n\nPlease contact ${business?.name} to arrange payment.\n\n📋 Plan: ${item.plan.planNumber} | Installment #${item.installmentNo}`
        : `📅 *Payment Reminder*\n\nDear ${item.customer.name},\n\nYour installment of ${currency} ${remaining.toFixed(2)} for ${item.plan.description} is due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.\n\n📋 Plan: ${item.plan.planNumber} | Installment #${item.installmentNo}\n📆 Due: ${new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

      // Add diaspora payment link if enabled
      if (item.paymentToken) {
        const frontendUrl = process.env.FRONTEND_URL || 'https://app.balanzify.com';
        msg += `\n\n💳 Pay online: ${frontendUrl}/pay/${item.paymentToken}`;
      }

      const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '');
      await prisma.whatsappLog.create({
        data: {
          businessId:    req.user.business_id,
          recipientPhone: normalizedPhone,
          messageType:   isOverdue ? 'payment_overdue' : 'payment_reminder',
          content:       msg,
          referenceType: 'payment_plan_item',
          referenceId:   item.id,
        },
      });

      sent.push({
        customer:      item.customer.name,
        phone:         normalizedPhone,
        wa_url:        `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(msg)}`,
        amount:        remaining,
        due_date:      item.dueDate,
        is_overdue:    isOverdue,
      });

      // Update last reminder time on plan
      await prisma.paymentPlan.update({
        where: { id: item.planId },
        data:  { lastReminderAt: new Date() },
      });
    }

    res.json({ sent: sent.length, reminders: sent });
  } catch (err) { next(err); }
});

// ── DIASPORA PAYMENT LINKS ────────────────────────────────────────

// POST /api/v1/credit/plans/:id/installments/:iid/diaspora-link
// Generate a payment link for a diaspora family member to pay
router.post('/plans/:id/installments/:iid/diaspora-link', auth, async (req, res, next) => {
  try {
    const item = await prisma.paymentPlanItem.findFirst({
      where: { id: req.params.iid, planId: req.params.id, businessId: req.user.business_id },
      include: {
        plan:     { select: { description: true, planNumber: true } },
        customer: { select: { name: true } },
      },
    });
    if (!item) return res.status(404).json({ error: 'Installment not found.' });
    if (item.status === 'paid') return res.status(400).json({ error: 'Already paid.' });

    // Generate or reuse token
    const token = item.paymentToken || creditEngine.generatePaymentToken();
    if (!item.paymentToken) {
      await prisma.paymentPlanItem.update({ where: { id: item.id }, data: { paymentToken: token } });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://app.balanzify.com';
    const paymentUrl  = `${frontendUrl}/pay/${token}`;
    const amount      = parseFloat(item.amount) - parseFloat(item.amountPaid);

    // WhatsApp shareable message for the customer to forward to family abroad
    const business = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { name: true, currency: true } });
    const currency  = item.currency || business?.currency || 'USD';
    const waMsg = `💳 *Pay installment for ${item.customer.name}*\n\n${item.plan.description}\nInstallment #${item.installmentNo}\nAmount: ${currency} ${amount.toFixed(2)}\nDue: ${new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\n\nPay securely online:\n${paymentUrl}\n\nPowered by Balanzify`;

    res.json({
      payment_url:  paymentUrl,
      token,
      amount,
      currency,
      due_date:     item.dueDate,
      wa_message:   waMsg,
      wa_url:       `https://wa.me/?text=${encodeURIComponent(waMsg)}`,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/pay/:token — PUBLIC payment page (no auth)
// The diaspora family member opens this to see what they're paying for
router.get('/pay/:token', async (req, res, next) => {
  try {
    const item = await prisma.paymentPlanItem.findFirst({
      where: { paymentToken: req.params.token },
      include: {
        plan: {
          include: {
            customer: { select: { name: true } },
            business: { select: { name: true, currency: true, logoUrl: true } },
          },
        },
      },
    });

    if (!item) return res.status(404).send('<h2>Payment link not found or expired.</h2>');
    if (item.status === 'paid') {
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Already Paid</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><div style="font-size:64px">✅</div><h2>This installment has already been paid.</h2><p>Thank you!</p></body></html>`);
    }

    const business  = item.plan.business;
    const customer  = item.plan.customer;
    const currency  = item.currency || business.currency || 'USD';
    const amount    = parseFloat(item.amount) - parseFloat(item.amountPaid);
    const dueDate   = new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // Get available payment methods for diaspora (international providers)
    const intlMethods = [];
    if (process.env.STRIPE_SECRET_KEY) intlMethods.push({ id: 'stripe', name: 'Card (Visa / Mastercard)', icon: '💳' });
    if (process.env.MOOV_API_KEY)       intlMethods.push({ id: 'moov',   name: 'Bank Transfer (ACH)',      icon: '🏦' });
    intlMethods.push({ id: 'manual', name: 'Bank transfer / other', icon: '📋' });

    const methodButtons = intlMethods.map(m =>
      `<button onclick="selectMethod('${m.id}')" id="btn-${m.id}" style="display:flex;align-items:center;gap:10px;width:100%;padding:14px;border:2px solid #E5E7EB;border-radius:10px;background:#fff;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:8px;">
        <span style="font-size:20px">${m.icon}</span>${m.name}
      </button>`
    ).join('');

    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Pay installment — ${business.name}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F3F4F6; min-height: 100vh; padding: 16px; }
.card { background: #fff; max-width: 420px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
.header { background: #1B3A6B; color: #fff; padding: 24px; text-align: center; }
.header h1 { font-size: 22px; font-weight: 800; }
.header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
.amount-box { background: #F0F9FF; border: 2px solid #BAE6FD; border-radius: 12px; padding: 20px; text-align: center; margin: 20px; }
.amount { font-size: 36px; font-weight: 900; color: #1B3A6B; }
.amount-label { font-size: 13px; color: #6B7280; margin-top: 4px; }
.section { padding: 0 20px 20px; }
.info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F0F2F5; font-size: 13px; }
.info-row:last-child { border-bottom: none; }
.info-label { color: #6B7280; }
.info-value { font-weight: 600; color: #111827; }
h3 { font-size: 14px; color: #374151; margin-bottom: 12px; }
.success { text-align: center; padding: 40px 20px; }
.powered { text-align: center; padding: 16px; font-size: 11px; color: #9CA3AF; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${business.name}</h1>
    <p>Installment Payment</p>
  </div>

  <div class="amount-box">
    <div class="amount">${currency} ${amount.toFixed(2)}</div>
    <div class="amount-label">Installment #${item.installmentNo} — Due ${dueDate}</div>
  </div>

  <div class="section">
    <div class="info-row"><span class="info-label">For</span><span class="info-value">${customer.name}</span></div>
    <div class="info-row"><span class="info-label">Plan</span><span class="info-value">${item.plan.description}</span></div>
    <div class="info-row"><span class="info-label">Plan number</span><span class="info-value">${item.plan.planNumber}</span></div>
    <div class="info-row"><span class="info-label">Installment</span><span class="info-value">${item.installmentNo} of ${item.plan.installments}</span></div>
  </div>

  <div class="section">
    <h3>Choose payment method:</h3>
    ${methodButtons}
  </div>

  <div id="manual-instructions" style="display:none;padding:0 20px 20px;">
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;font-size:13px;">
      <strong>Bank transfer instructions:</strong><br><br>
      Please transfer <strong>${currency} ${amount.toFixed(2)}</strong> and include this reference:<br>
      <code style="background:#E5E7EB;padding:4px 8px;border-radius:4px;font-size:14px;font-weight:700;">${item.paymentToken?.slice(0,12).toUpperCase()}</code><br><br>
      Contact ${business.name} to confirm which account to use for your country.
    </div>
    <button onclick="confirmManual()" style="width:100%;margin-top:12px;padding:14px;background:#1B3A6B;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      I've made the transfer →
    </button>
  </div>

  <div class="powered">Powered by Balanzify</div>
</div>

<script>
function selectMethod(method) {
  document.querySelectorAll('button[id^="btn-"]').forEach(b => b.style.borderColor = '#E5E7EB');
  document.getElementById('btn-' + method).style.borderColor = '#1B3A6B';
  document.getElementById('manual-instructions').style.display = method === 'manual' ? 'block' : 'none';
  if (method === 'stripe') window.location.href = '/api/v1/pay/${req.params.token}/charge?provider=stripe';
  if (method === 'moov')   window.location.href = '/api/v1/pay/${req.params.token}/charge?provider=moov';
}
function confirmManual() {
  fetch('/api/v1/pay/${req.params.token}/confirm-manual', { method: 'POST' })
    .then(() => { document.querySelector('.card').innerHTML = '<div class="success"><div style="font-size:64px">✅</div><h2 style="margin-top:16px">Transfer recorded!</h2><p style="color:#6B7280;margin-top:8px">${business.name} will confirm when it arrives.</p></div>'; });
}
</script>
</body>
</html>`);
  } catch (err) { next(err); }
});

// POST /api/v1/pay/:token/confirm-manual
// Payer confirms they've made a manual transfer
router.post('/pay/:token/confirm-manual', async (req, res, next) => {
  try {
    const item = await prisma.paymentPlanItem.findFirst({
      where: { paymentToken: req.params.token },
      include: { plan: { select: { businessId: true, customerId: true, planNumber: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Not found.' });

    // Create a diaspora payment record in pending state
    await prisma.diasporaPayment.create({
      data: {
        businessId:  item.plan.businessId,
        customerId:  item.plan.customerId,
        planItemId:  item.id,
        amount:      parseFloat(item.amount) - parseFloat(item.amountPaid),
        currency:    item.currency || 'USD',
        provider:    'manual',
        status:      'processing',
        paymentToken: item.paymentToken,
        notes:       'Payer confirmed transfer via payment link',
      },
    });

    // Notify business owner via WhatsApp that a payment is coming
    const business = await prisma.business.findUnique({
      where: { id: item.plan.businessId },
      select: { phone: true, whatsapp: true, name: true },
    });
    if (business?.whatsapp || business?.phone) {
      const ownerPhone = (business.whatsapp || business.phone).replace(/\D/g, '').replace(/^0/, '');
      const msg = `💰 *Incoming payment notification*\n\nA diaspora payment is on the way for Plan ${item.plan.planNumber}, Installment #${item.installmentNo}.\n\nAmount: ${item.currency || 'USD'} ${(parseFloat(item.amount) - parseFloat(item.amountPaid)).toFixed(2)}\n\nPlease confirm when received in Balanzify.`;
      await prisma.whatsappLog.create({
        data: { businessId: item.plan.businessId, recipientPhone: ownerPhone, messageType: 'diaspora_incoming', content: msg, referenceType: 'payment_plan_item', referenceId: item.id },
      });
    }

    res.json({ message: 'Transfer noted. Business will confirm when received.' });
  } catch (err) { next(err); }
});

// ── SETTLEMENT PROVIDERS ──────────────────────────────────────────

// GET /api/v1/credit/settlement/providers
router.get('/settlement/providers', auth, async (req, res, next) => {
  try {
    const { country } = req.query;
    const providers = await prisma.settlementProvider.findMany({
      where: { isActive: true, ...(country && { country }) },
      select: {
        id: true, name: true, type: true, country: true, currency: true,
        mode: true, supportsBalance: true, supportsTransactions: true,
        supportsInbound: true, supportsOutbound: true, supportsFx: true,
      },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    });
    res.json({ providers });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/settlement/providers — owner/admin adds a new country partner
router.post('/settlement/providers', auth, requireRole('owner'), validate(z.object({
  name:                z.string().trim().min(1).max(255),
  type:                z.enum(['bank','mobile_money','fintech']),
  country:             z.string().length(2).toUpperCase(),
  currency:            z.string().length(3).toUpperCase(),
  mode:                z.enum(['manual','webhook','polling','api']).default('manual'),
  apiBaseUrl:          z.string().url().optional().nullable(),
  supportsBalance:     z.boolean().default(false),
  supportsTransactions: z.boolean().default(false),
  supportsInbound:     z.boolean().default(true),
  supportsOutbound:    z.boolean().default(false),
  supportsFx:          z.boolean().default(false),
  notes:               z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const provider = await prisma.settlementProvider.create({ data: req.body });
    res.status(201).json(provider);
  } catch (err) { next(err); }
});

// GET /api/v1/credit/settlement/accounts
router.get('/settlement/accounts', auth, async (req, res, next) => {
  try {
    const accounts = await prisma.settlementAccount.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { provider: { select: { name: true, country: true, currency: true, type: true } } },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

// POST /api/v1/credit/settlement/accounts — link merchant to a settlement provider
router.post('/settlement/accounts', auth, requireRole('owner'), validate(z.object({
  providerId:    uuid,
  accountNumber: z.string().max(100).optional().nullable(),
  accountName:   z.string().max(255).optional().nullable(),
  currency:      z.string().length(3).default('USD'),
  isDefault:     z.boolean().default(false),
})), async (req, res, next) => {
  try {
    const { providerId, accountNumber, accountName, currency, isDefault } = req.body;

    if (isDefault) {
      await prisma.settlementAccount.updateMany({
        where: { businessId: req.user.business_id, isDefault: true },
        data:  { isDefault: false },
      });
    }

    const account = await prisma.settlementAccount.create({
      data: { businessId: req.user.business_id, providerId, accountNumber, accountName, currency, isDefault },
      include: { provider: { select: { name: true, country: true } } },
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

module.exports = router;
