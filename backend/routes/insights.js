/**
 * AI Insights Routes
 *
 * GET  /api/v1/insights/context          — raw business context (for debugging)
 * POST /api/v1/insights/ask              — ask a question, get an answer
 * POST /api/v1/insights/conversation     — multi-turn conversation with history
 * GET  /api/v1/insights/briefing         — daily morning briefing
 * GET  /api/v1/insights/suggestions      — suggested questions based on current data
 *
 * Rate limited separately — AI calls cost money.
 * Cached context — gatherContext() is expensive (10+ DB queries).
 * Context cached for 10 minutes per business.
 */

const express = require('express');
const { z }   = require('zod');
const { auth, requireRole } = require('../middleware/auth');
const { validate }          = require('../middleware/validate');
const { gatherContext, askInsight, generateDailyBriefing } = require('../lib/insights');
const { logger } = require('../lib/logger');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// AI calls are expensive — stricter rate limit than other endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max:      10,            // 10 AI calls per minute per IP
  message:  { error: 'Too many AI requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Context cache ─────────────────────────────────────────────────
// gatherContext() runs 15+ DB queries — cache it for 10 minutes
const contextCache = new Map(); // businessId → { context, cachedAt }
const CONTEXT_TTL  = 10 * 60 * 1000; // 10 minutes

async function getCachedContext(businessId, days = 30) {
  const key    = `${businessId}:${days}`;
  const cached = contextCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_TTL) {
    return cached.context;
  }
  const context = await gatherContext(businessId, { days });
  contextCache.set(key, { context, cachedAt: Date.now() });
  return context;
}

// ── Routes ────────────────────────────────────────────────────────

// GET /api/v1/insights/context
// Returns the raw context data — useful for debugging and for building
// custom dashboards in the frontend
router.get('/context', auth, async (req, res, next) => {
  try {
    const days    = parseInt(req.query.days) || 30;
    const context = await getCachedContext(req.user.business_id, days);
    res.json(context);
  } catch (err) { next(err); }
});

// GET /api/v1/insights/suggestions
// Returns suggested questions based on the current business state
// No AI call needed — computed from context data
router.get('/suggestions', auth, async (req, res, next) => {
  try {
    const context = await getCachedContext(req.user.business_id);
    const suggestions = [];

    // Revenue-based suggestions
    if (context.revenue.change_pct !== null && context.revenue.change_pct < -10) {
      suggestions.push({
        question: `My revenue dropped ${Math.abs(context.revenue.change_pct)}% — what happened?`,
        category: 'revenue',
        urgent:   true,
      });
    }
    if (context.revenue.change_pct !== null && context.revenue.change_pct > 20) {
      suggestions.push({
        question: `Revenue is up ${context.revenue.change_pct}% — what's driving this?`,
        category: 'revenue',
        urgent:   false,
      });
    }

    // Inventory suggestions
    if (context.inventory.out_of_stock > 0) {
      suggestions.push({
        question: `I have ${context.inventory.out_of_stock} products out of stock — what should I reorder?`,
        category: 'inventory',
        urgent:   true,
      });
    }
    if (context.inventory.low_stock_count > 0) {
      suggestions.push({
        question: `Which ${context.inventory.low_stock_count} products are running low and when should I order?`,
        category: 'inventory',
        urgent:   true,
      });
    }
    if (context.products.deadstock.length > 0) {
      const capital = context.products.deadstock.reduce((s, p) => s + p.tied_capital, 0);
      suggestions.push({
        question: `I have ${context.products.deadstock.length} products not selling with ${context.meta.currency} ${capital.toFixed(0)} tied up — what should I do?`,
        category: 'inventory',
        urgent:   false,
      });
    }

    // Staff suggestions
    if (context.staff.length > 1) {
      suggestions.push({
        question: 'How is my team performing and who needs coaching?',
        category: 'staff',
        urgent:   false,
      });
    }
    if (context.refunds.rate_pct > 5) {
      suggestions.push({
        question: `My refund rate is ${context.refunds.rate_pct}% — is that high and what should I do?`,
        category: 'staff',
        urgent:   true,
      });
    }

    // Customer suggestions
    if (context.customers.pct_with_account < 30) {
      suggestions.push({
        question: 'Only some customers have accounts — how can I get more to register?',
        category: 'customers',
        urgent:   false,
      });
    }
    const creditCustomers = context.customers.top.filter(c => c.balance_owed > 0);
    if (creditCustomers.length > 0) {
      suggestions.push({
        question: `${creditCustomers.length} customers owe me money — how should I follow up?`,
        category: 'customers',
        urgent:   true,
      });
    }

    // Trend suggestions
    if (context.trends.worst_day) {
      suggestions.push({
        question: `${context.trends.worst_day.day} is my slowest day — what promotion could help?`,
        category: 'growth',
        urgent:   false,
      });
    }

    // Hotel/restaurant suggestions
    if (context.hotel) {
      suggestions.push({
        question: 'How is my hotel occupancy and what can I do to improve it?',
        category: 'hotel',
        urgent:   false,
      });
    }
    if (context.restaurant) {
      suggestions.push({
        question: 'What are my best-selling menu items and what should I promote?',
        category: 'restaurant',
        urgent:   false,
      });
    }

    // Always-available questions
    suggestions.push(
      { question: 'Give me a summary of my business performance this month', category: 'overview', urgent: false },
      { question: 'Which products have the best and worst margins?', category: 'profitability', urgent: false },
      { question: 'Who are my most valuable customers?', category: 'customers', urgent: false },
      { question: 'What should I order from suppliers this week?', category: 'inventory', urgent: false },
    );

    // Sort: urgent first, then by category
    suggestions.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

    res.json({
      suggestions: suggestions.slice(0, 8),
      data_period_days: context.meta.periodDays,
      cached_at:        new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// POST /api/v1/insights/ask
// Single question — no conversation history
router.post('/ask', auth, aiLimiter, validate(z.object({
  question: z.string().trim().min(3).max(1000),
  days:     z.coerce.number().int().min(1).max(365).default(30),
})), async (req, res, next) => {
  try {
    const { question, days } = req.body;
    logger.info('ai_insight_request', { businessId: req.user.business_id, question: question.slice(0, 100) });

    const context = await getCachedContext(req.user.business_id, days);
    // Always answers: the live model when configured, else a deterministic
    // GL-grounded answer (mode: 'rules'). Never 503s for a missing key.
    const { answer, suggestedQuestions, mode } = await askInsight(context, question);

    res.json({
      question,
      answer,
      suggested_questions: suggestedQuestions,
      data_period_days:    days,
      business:            context.meta.businessName,
      ai_enabled:          mode === 'ai',
    });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE') return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/insights/conversation
// Multi-turn conversation — maintains context across messages
// Frontend sends full history each time (stateless backend)
router.post('/conversation', auth, aiLimiter, validate(z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).default([]),
  days:    z.coerce.number().int().min(1).max(365).default(30),
})), async (req, res, next) => {
  try {
    const { message, history, days } = req.body;
    const context = await getCachedContext(req.user.business_id, days);
    const { answer, suggestedQuestions, mode } = await askInsight(context, message, history);

    res.json({
      message,
      answer,
      suggested_questions: suggestedQuestions,
      ai_enabled: mode === 'ai',
      // Return updated history for frontend to store
      history: [
        ...history,
        { role: 'user',      content: message },
        { role: 'assistant', content: answer  },
      ],
    });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE') return res.status(503).json({ error: err.message });
    next(err);
  }
});

// GET /api/v1/insights/briefing
// Morning briefing — proactive summary of what needs attention today
router.get('/briefing', auth, aiLimiter, async (req, res, next) => {
  try {
    // generateDailyBriefing answers either way — live model when configured, else
    // a deterministic GL-grounded briefing.
    const { briefing, urgent, mode } = await generateDailyBriefing(req.user.business_id);
    res.json({ briefing, urgent, ai_enabled: mode === 'ai' });
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE') return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/v1/insights/context/refresh
// Force refresh the context cache (e.g. after a large batch of sales)
router.post('/context/refresh', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const key  = `${req.user.business_id}:${days}`;
    contextCache.delete(key);
    const context = await getCachedContext(req.user.business_id, days);
    res.json({ refreshed: true, period_days: days, business: context.meta.businessName });
  } catch (err) { next(err); }
});

module.exports = router;
