/**
 * HRM — payroll runs, pay components, batches, payslips and statutory filing.
 */
const {
  PL_UUID, PayComponentSchema, PayrollGroupSchema, PayrollSchema, PayslipSettingsSchema,
  accounting, applyComponents, auth, buildSummary, componentsFor, express, grossOf,
  groupInclude, loadSettings, monthRange, nextPayrollRef, prisma, requireRole,
  serializeComponent, serializeGroup, serializePayroll, statutory, validate, wa, z,
  isManager, myEmployee,
} = require('./_shared');

const router = express.Router();

router.get('/pay-component', auth, async (req, res, next) => {
  try {
    const rows = await prisma.payComponent.findMany({
      where: { businessId: req.user.business_id },
      include: { employee: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { description: 'asc' }],
    });
    res.json(rows.map(serializeComponent));
  } catch (err) { next(err); }
});

router.post('/pay-component', auth, requireRole('owner', 'manager'), validate(PayComponentSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    if (b.employee_id) {
      const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true } });
      if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    }
    const created = await prisma.payComponent.create({
      data: {
        businessId, description: b.description, type: b.type,
        amountType: b.amount_type, amount: b.amount,
        applicableDate: b.applicable_date ? new Date(b.applicable_date) : null,
        employeeId: b.employee_id || null,
      },
      include: { employee: { select: { name: true } } },
    });
    res.status(201).json(serializeComponent(created));
  } catch (err) { next(err); }
});

router.put('/pay-component/:id', auth, requireRole('owner', 'manager'), validate(PayComponentSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const existing = await prisma.payComponent.findFirst({ where: { id: req.params.id, businessId }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (b.employee_id) {
      const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true } });
      if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });
    }
    const updated = await prisma.payComponent.update({
      where: { id: req.params.id },
      data: {
        description: b.description, type: b.type, amountType: b.amount_type, amount: b.amount,
        applicableDate: b.applicable_date ? new Date(b.applicable_date) : null,
        employeeId: b.employee_id || null,
      },
      include: { employee: { select: { name: true } } },
    });
    res.json(serializeComponent(updated));
  } catch (err) { next(err); }
});

router.delete('/pay-component/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const c = await prisma.payComponent.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!c) return res.status(404).json({ title: 'Not found', status: 404 });
    // Runs that already applied it keep their own PayrollLine rows, so history
    // survives the definition being retired.
    await prisma.payComponent.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.get('/payroll', auth, async (req, res, next) => {
  try {
    const q = req.query;
    const rows = await prisma.payroll.findMany({
      where: {
        businessId: req.user.business_id,
        ...(q.month && { month: String(q.month) }),
        ...(q.employee_id && PL_UUID.test(String(q.employee_id)) && { employeeId: String(q.employee_id) }),
        ...(q.location_id && PL_UUID.test(String(q.location_id)) && { locationId: String(q.location_id) }),
        ...(q.department && { employee: { department: String(q.department) } }),
        ...(q.designation && { employee: { designation: String(q.designation) } }),
      },
      include: { employee: { select: { name: true, department: true, designation: true } }, lines: true, location: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 1000,
    });
    res.json(rows.map(serializePayroll));
  } catch (err) { next(err); }
});

router.post('/payroll', auth, requireRole('owner', 'manager'), validate(PayrollSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: b.employee_id, businessId }, select: { id: true, name: true, joinedAt: true, locationId: true } });
    if (!emp) return res.status(404).json({ title: 'Employee not found', status: 404 });

    // Paying a month twice also posts the GL journal twice, so refuse it up
    // front for a readable error. The unique index is the real guard.
    const already = await prisma.payroll.findFirst({
      where: { businessId, employeeId: emp.id, month: b.month }, select: { id: true },
    });
    if (already) {
      return res.status(409).json({
        title: `${emp.name} has already been paid for ${b.month}.`,
        status: 409, code: 'PAYROLL_EXISTS', payroll_id: already.id,
      });
    }

    // Pro-rate the basic for a mid-month joiner: only the days from the join date
    // to month-end are paid. Opt-in, and only when the join falls in this month.
    let basic = b.basic, proration = null;
    if (b.prorate && emp.joinedAt) {
      const { start, end } = monthRange(b.month);
      const join = new Date(emp.joinedAt);
      if (join >= start && join < end) {
        const daysInMonth = Math.round((end - start) / 86400000);
        const workedDays = Math.round((end - join) / 86400000);
        basic = +(b.basic * workedDays / daysInMonth).toFixed(2);
        proration = { worked_days: workedDays, days_in_month: daysInMonth, full_basic: b.basic, prorated_basic: basic };
      }
    }
    // Named components resolved for this employee and month, on top of the
    // freeform amounts typed on the run itself.
    const comps = applyComponents(await componentsFor(businessId, emp.id, b.month), basic);
    const gross = +(basic + b.allowance + b.overtime + b.bonus + b.incentive + comps.earnings).toFixed(2);
    const freeformDeduction = +(b.deduction + comps.deductions).toFixed(2);
    // Statutory deductions (PAYE/NSSF/SHIF/Housing) computed from gross, on top of
    // the freeform deduction (advances etc.). No country → no statutory (launch markets).
    const stat = b.statutory_country && b.statutory_country !== 'none'
      ? statutory.compute(b.statutory_country, gross)
      : null;
    const statutoryTotal = stat ? stat.total_statutory : 0;
    const pset = await loadSettings(businessId);

    const payroll = await prisma.$transaction(async (tx) => {
      // Recover outstanding advances (oldest first) up to what was asked for.
      // This is deliberately NOT taken out of `deduction`: those are two
      // different instructions, and conflating them meant a tax deduction
      // silently settled the employee's loan instead.
      let remaining = b.advance_recovery, recovered = 0;
      if (remaining > 0) {
        const advances = await tx.hrAdvance.findMany({ where: { businessId, employeeId: emp.id, status: 'outstanding' }, orderBy: { createdAt: 'asc' } });
        for (const adv of advances) {
          if (remaining <= 0) break;
          const out = parseFloat(adv.outstanding);
          const take = Math.min(out, remaining);
          const newOut = +(out - take).toFixed(2);
          await tx.hrAdvance.update({ where: { id: adv.id }, data: { outstanding: newOut, status: newOut <= 0.001 ? 'settled' : 'outstanding' } });
          remaining = +(remaining - take).toFixed(2);
          recovered += take;
        }
      }
      recovered = +recovered.toFixed(2);
      // Net is reduced by what was ACTUALLY recovered — asking to recover more
      // than is outstanding must not over-deduct the employee.
      const net = +(gross - freeformDeduction - recovered - statutoryTotal).toFixed(2);
      const created = await tx.payroll.create({
        data: {
          businessId, employeeId: emp.id, month: b.month, basic, allowance: b.allowance,
          overtime: b.overtime, bonus: b.bonus, incentive: b.incentive, deduction: freeformDeduction,
          advanceRecovered: recovered,
          ...(comps.lines.length && { lines: { create: comps.lines } }),
          statutoryCountry: stat ? stat.country : null,
          paye: stat ? stat.paye : 0, nssf: stat ? stat.nssf : 0, shif: stat ? stat.shif : 0,
          housingLevy: stat ? stat.housing_levy : 0, statutoryTotal,
          net,
          // A single run is committed immediately, as before. A group builds
          // drafts and commits them together — see POST /payroll-group.
          status: b.status || 'paid',
          paidAt: (b.status || 'paid') === 'paid' ? new Date() : null,
          referenceNo: await nextPayrollRef(tx, businessId, b.month, pset.payrollRefPrefix),
          locationId: emp.locationId || null,
          createdById: req.user.id,
          groupId: b.group_id || null,
        },
        include: { employee: { select: { name: true } }, lines: true },
      });
      // GL: gross wages expensed, net paid in cash, freeform + statutory withheld as payables.
      // postPayroll's contract is `deduction = advanceRecovered + withholding`,
      // so hand it the combined figure to keep the journal balanced.
      // A draft commits no money, so it posts nothing until it is paid.
      if (created.status === 'paid') {
        await accounting.postPayroll(tx, { businessId, gross, net, deduction: +(freeformDeduction + recovered).toFixed(2), advanceRecovered: recovered, statutory: statutoryTotal, sourceId: created.id, createdById: req.user.id });
      }
      return created;
    });
    res.status(201).json({ ...serializePayroll(payroll), ...(proration && { proration }) });
  } catch (err) { next(err); }
});

router.get('/payroll-group', auth, async (req, res, next) => {
  try {
    const rows = await prisma.payrollGroup.findMany({
      where: { businessId: req.user.business_id },
      include: groupInclude, orderBy: { createdAt: 'desc' }, take: 500,
    });
    res.json(rows.map(serializeGroup));
  } catch (err) { next(err); }
});

router.post('/payroll-group', auth, requireRole('owner', 'manager'), validate(PayrollGroupSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id, b = req.body;
    const ids = [...new Set(b.employee_ids)];
    const emps = await prisma.employee.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true, name: true, salary: true, locationId: true, joinedAt: true },
    });
    if (emps.length !== ids.length) return res.status(404).json({ title: 'One or more employees were not found.', status: 404 });

    // Anyone already paid for this month would violate the one-per-month rule.
    const clash = await prisma.payroll.findMany({
      where: { businessId, month: b.month, employeeId: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    if (clash.length) {
      return res.status(409).json({
        title: `Already has a payroll for ${b.month}: ${clash.map(c => c.employee?.name).join(', ')}.`,
        status: 409, code: 'PAYROLL_EXISTS',
      });
    }

    const gSettings = await loadSettings(businessId);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.payrollGroup.create({
        data: {
          businessId, name: b.name, month: b.month,
          locationId: b.location_id || null, createdById: req.user.id,
        },
      });
      for (const emp of emps) {
        const basic = parseFloat(emp.salary || 0);
        const comps = applyComponents(await componentsFor(businessId, emp.id, b.month), basic);
        const gross = +(basic + comps.earnings).toFixed(2);
        const net = +(gross - comps.deductions).toFixed(2);
        await tx.payroll.create({
          data: {
            businessId, employeeId: emp.id, month: b.month, basic,
            deduction: comps.deductions, net,
            status: 'draft', groupId: g.id,
            referenceNo: await nextPayrollRef(tx, businessId, b.month, gSettings.payrollRefPrefix),
            locationId: emp.locationId || null, createdById: req.user.id,
            ...(comps.lines.length && { lines: { create: comps.lines } }),
          },
        });
      }
      return g;
    });
    const full = await prisma.payrollGroup.findUnique({ where: { id: group.id }, include: groupInclude });
    res.status(201).json(serializeGroup(full));
  } catch (err) { next(err); }
});

// Commit the batch: every draft becomes paid and posts its journal here, so a
// group can be assembled and reviewed before any money moves.
router.put('/payroll-group/:id/pay', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const g = await prisma.payrollGroup.findFirst({
      where: { id: req.params.id, businessId }, include: { payrolls: { include: { lines: true } } },
    });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.paymentStatus === 'paid') return res.status(409).json({ title: 'This group has already been paid.', status: 409, code: 'ALREADY_PAID' });

    const drafts = g.payrolls.filter(p => p.status === 'draft');
    if (!drafts.length) return res.status(400).json({ title: 'Nothing left to pay in this group.', status: 400 });

    const paidAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const p of drafts) {
        const gross = grossOf(p);
        await tx.payroll.update({ where: { id: p.id }, data: { status: 'paid', paidAt } });
        await accounting.postPayroll(tx, {
          businessId, gross, net: parseFloat(p.net),
          deduction: +(parseFloat(p.deduction) + parseFloat(p.advanceRecovered)).toFixed(2),
          advanceRecovered: parseFloat(p.advanceRecovered),
          statutory: parseFloat(p.statutoryTotal),
          sourceId: p.id, createdById: req.user.id,
        });
      }
      await tx.payrollGroup.update({
        where: { id: g.id }, data: { status: 'paid', paymentStatus: 'paid', paidAt },
      });
    });
    const full = await prisma.payrollGroup.findUnique({ where: { id: g.id }, include: groupInclude });
    res.json(serializeGroup(full));
  } catch (err) { next(err); }
});

// Only an unpaid group can be discarded — a paid one has journal entries.
router.delete('/payroll-group/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const g = await prisma.payrollGroup.findFirst({ where: { id: req.params.id, businessId }, select: { id: true, paymentStatus: true } });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.paymentStatus === 'paid') {
      return res.status(422).json({ title: 'A paid group cannot be deleted — it has posted journal entries.', status: 422, code: 'GROUP_PAID' });
    }
    await prisma.$transaction([
      prisma.payroll.deleteMany({ where: { businessId, groupId: g.id, status: 'draft' } }),
      prisma.payrollGroup.delete({ where: { id: g.id } }),
    ]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// Remit a month's statutory withholding to the authority — clears the Statutory
// Payable (2120) and pays it out. Idempotent: only un-remitted runs are paid.
router.post('/payroll/remit-statutory', auth, requireRole('owner', 'manager'), validate(z.object({
  month:  z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  method: z.string().max(30).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.payroll.findMany({
        where: { businessId, month: req.body.month, statutoryTotal: { gt: 0 }, statutoryRemittedAt: null },
        select: { id: true, statutoryTotal: true },
      });
      const total = +rows.reduce((s, r) => s + parseFloat(r.statutoryTotal), 0).toFixed(2);
      if (total <= 0) return { total: 0, count: 0 };
      await tx.payroll.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { statutoryRemittedAt: new Date() } });
      await accounting.postJournal(tx, {
        businessId, description: `Statutory remittance — ${req.body.month}`,
        sourceType: 'statutory_remittance', sourceId: null, createdById: req.user.id,
        lines: [
          { code: '2120', debit: total, credit: 0, description: 'Statutory payable settled' },
          { code: accounting.tenderAccountCode(req.body.method || 'bank'), debit: 0, credit: total, description: 'Remitted to authority' },
        ],
      });
      return { total, count: rows.length };
    });
    if (result.count === 0) return res.status(400).json({ title: 'No outstanding statutory to remit for this month', status: 400 });
    res.json({ message: `Remitted statutory for ${result.count} payroll run(s).`, remitted: result.total, runs: result.count });
  } catch (err) { next(err); }
});

// Preview statutory deductions for a gross + country (no persistence) — for the
// payroll screen to show PAYE/NSSF/SHIF/Housing and net before running payroll.
router.post('/payroll/compute', auth, requireRole('owner', 'manager'), validate(z.object({
  gross: z.coerce.number().nonnegative(),
  country: z.enum(statutory.COUNTRIES).default('none'),
})), async (req, res, next) => {
  try {
    res.json(statutory.compute(req.body.country, req.body.gross));
  } catch (err) { next(err); }
});

// Statutory filing report for a month: per-employee PAYE/NSSF/SHIF/Housing plus
// totals — the numbers an operator files with KRA / NSSF / SHA.
router.get('/payroll/statutory-report', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ title: 'Provide month=YYYY-MM', status: 400 });
    const rows = await prisma.payroll.findMany({
      where: { businessId, month, statutoryTotal: { gt: 0 } },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const lines = rows.map(p => ({
      employee: p.employee?.name || '', country: p.statutoryCountry,
      gross: +(parseFloat(p.basic) + parseFloat(p.allowance) + parseFloat(p.overtime) + parseFloat(p.bonus) + parseFloat(p.incentive)).toFixed(2),
      paye: parseFloat(p.paye), nssf: parseFloat(p.nssf), shif: parseFloat(p.shif),
      housing_levy: parseFloat(p.housingLevy), total: parseFloat(p.statutoryTotal),
    }));
    const sum = (k) => +lines.reduce((s, l) => s + l[k], 0).toFixed(2);
    res.json({
      month, employees: lines.length,
      totals: { paye: sum('paye'), nssf: sum('nssf'), shif: sum('shif'), housing_levy: sum('housing_levy'), total: sum('total') },
      lines,
    });
  } catch (err) { next(err); }
});

router.get('/payslip/:id', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    // A payslip is the employee's own document and management information for
    // everyone else. This was `auth` only, so any authenticated user in the
    // business could read anyone's pay by guessing an id.
    if (!isManager(req)) {
      const me = await myEmployee(req);
      const owned = me && await prisma.payroll.findFirst({
        where: { id: req.params.id, businessId, employeeId: me.id }, select: { id: true },
      });
      if (!owned) return res.status(403).json({ title: 'You can only view your own payslip.', status: 403 });
    }
    const p = await prisma.payroll.findFirst({
      where: { id: req.params.id, businessId },
      include: { employee: { include: { location: { select: { name: true } } } }, lines: true },
    });
    if (!p) return res.status(404).json({ title: 'Not found', status: 404 });
    const emp = p.employee;
    const settings = await loadSettings(businessId);
    const { m, start, end } = monthRange(p.month);
    settings._month = m;
    const [records, leaves] = await Promise.all([
      prisma.attendance.findMany({ where: { businessId, employeeId: emp.id, date: { gte: start, lt: end } } }),
      prisma.leave.findMany({ where: { businessId, employeeId: emp.id, status: 'approved' } }),
    ]);
    const att = await buildSummary({ id: emp.id, name: emp.name, salary: emp.salary }, records, settings);
    res.json({
      employee: { name: emp.name, designation: emp.designation || '', department: emp.department || '', location: emp.location?.name || '' },
      month: p.month,
      earnings: { basic: parseFloat(p.basic), allowance: parseFloat(p.allowance), overtime: parseFloat(p.overtime), bonus: parseFloat(p.bonus), incentive: parseFloat(p.incentive) },
      deductions: {
        total: parseFloat(p.deduction), late: att.late_deduction, absent: att.absent_deduction,
        advance_recovered: parseFloat(p.advanceRecovered),
        items: p.lines.filter(l => l.type === 'deduction').map(l => ({ description: l.description, amount: parseFloat(l.amount) })),
      },
      earning_items: p.lines.filter(l => l.type === 'earning').map(l => ({ description: l.description, amount: parseFloat(l.amount) })),
      statutory: parseFloat(p.statutoryTotal) > 0 ? {
        country: p.statutoryCountry, paye: parseFloat(p.paye), nssf: parseFloat(p.nssf),
        shif: parseFloat(p.shif), housing_levy: parseFloat(p.housingLevy), total: parseFloat(p.statutoryTotal),
        remitted: !!p.statutoryRemittedAt,
      } : null,
      attendance: { days_worked: att.days_worked, total_hours: att.total_hours, overtime_hours: att.overtime_hours, present: att.present, late: att.late, absent: att.absent },
      leave: leaves.map(l => ({ type: l.type, days: l.days, from: l.fromDate.toISOString().slice(0, 10), to: l.toDate.toISOString().slice(0, 10) })),
      net: parseFloat(p.net), status: p.status,
      settings: {
        show_attendance: settings.showAttendance, show_overtime: settings.showOvertime, show_leave: settings.showLeave,
        show_advance: settings.showAdvance, show_bonus: settings.showBonus, show_incentive: settings.showIncentive,
        show_deduction_breakdown: settings.showDeductionBreakdown,
      },
    });
  } catch (err) { next(err); }
});

// Distribute a payslip to the employee over WhatsApp (the artifact existed; this
// closes the "delivery" half of the gap). Phone is provided by the manager.
router.post('/payslip/:id/send-whatsapp', auth, requireRole('owner', 'manager'), validate(z.object({
  phone: z.string().trim().min(3).max(50),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const p = await prisma.payroll.findFirst({ where: { id: req.params.id, businessId }, include: { employee: { select: { name: true } } } });
    if (!p) return res.status(404).json({ title: 'Payslip not found', status: 404 });
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    const gross = ['basic', 'allowance', 'overtime', 'bonus', 'incentive'].reduce((s, k) => s + parseFloat(p[k] || 0), 0);
    const msg = `*Payslip — ${business?.name || 'Payroll'}*\n${p.employee.name} · ${p.month}\n\nGross: $${gross.toFixed(2)}\nDeductions: $${parseFloat(p.deduction).toFixed(2)}\n*Net pay: $${parseFloat(p.net).toFixed(2)}*\n\nThank you.`;
    const r = await wa.send({ businessId, to: req.body.phone, text: msg, kind: 'payslip', referenceType: 'payroll', referenceId: p.id });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (err) { next(err); }
});

router.get('/payslip-settings', auth, async (req, res, next) => {
  try {
    const s = await loadSettings(req.user.business_id);
    res.json({
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    });
  } catch (err) { next(err); }
});

router.put('/payslip-settings', auth, requireRole('owner', 'manager'), validate(PayslipSettingsSchema), async (req, res, next) => {
  try {
    await loadSettings(req.user.business_id);
    const b = req.body;
    const s = await prisma.hrmSettings.update({
      where: { businessId: req.user.business_id },
      data: {
        ...(b.show_attendance !== undefined && { showAttendance: b.show_attendance }),
        ...(b.show_overtime !== undefined && { showOvertime: b.show_overtime }),
        ...(b.show_leave !== undefined && { showLeave: b.show_leave }),
        ...(b.show_advance !== undefined && { showAdvance: b.show_advance }),
        ...(b.show_bonus !== undefined && { showBonus: b.show_bonus }),
        ...(b.show_incentive !== undefined && { showIncentive: b.show_incentive }),
        ...(b.show_deduction_breakdown !== undefined && { showDeductionBreakdown: b.show_deduction_breakdown }),
      },
    });
    res.json({
      show_attendance: s.showAttendance, show_overtime: s.showOvertime, show_leave: s.showLeave,
      show_advance: s.showAdvance, show_bonus: s.showBonus, show_incentive: s.showIncentive,
      show_deduction_breakdown: s.showDeductionBreakdown,
    });
  } catch (err) { next(err); }
});

module.exports = router;
