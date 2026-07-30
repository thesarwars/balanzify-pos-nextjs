/**
 * HRM — HRM settings.
 */
const {
  HrmSettingsSchema, auth, empShiftMap, express, loadSettings, prisma, requireRole,
  serializeSettings, validate,
} = require('./_shared');

const router = express.Router();

router.get('/settings', auth, async (req, res, next) => {
  try {
    const s = await loadSettings(req.user.business_id);
    res.json(serializeSettings(s, await empShiftMap(req.user.business_id)));
  } catch (err) { next(err); }
});

router.put('/settings', auth, requireRole('owner', 'manager'), validate(HrmSettingsSchema), async (req, res, next) => {
  try {
    await loadSettings(req.user.business_id);
    const b = req.body;
    const s = await prisma.hrmSettings.update({
      where: { businessId: req.user.business_id },
      data: {
        ...(b.work_start       !== undefined && { workStart: b.work_start }),
        ...(b.grace_minutes    !== undefined && { graceMinutes: b.grace_minutes }),
        ...(b.timezone         !== undefined && { timezone: b.timezone }),
        ...(b.standard_hours   !== undefined && { standardHours: b.standard_hours }),
        ...(b.half_day_hours   !== undefined && { halfDayHours: b.half_day_hours }),
        ...(b.overtime_rate    !== undefined && { overtimeRate: b.overtime_rate }),
        ...(b.working_days     !== undefined && { workingDays: b.working_days }),
        ...(b.late_deduction   !== undefined && { lateDeduction: b.late_deduction }),
        ...(b.absent_deduction !== undefined && { absentDeduction: b.absent_deduction }),
        ...(b.leave_ref_prefix   !== undefined && { leaveRefPrefix: b.leave_ref_prefix || null }),
        ...(b.leave_instructions !== undefined && { leaveInstructions: b.leave_instructions || null }),
        ...(b.payroll_ref_prefix !== undefined && { payrollRefPrefix: b.payroll_ref_prefix || null }),
        ...(b.payroll_word_format !== undefined && { payrollWordFormat: b.payroll_word_format }),
        ...(b.location_required  !== undefined && { locationRequired: b.location_required }),
        // "grace after checkin" is the existing graceMinutes.
        ...(b.grace_after_checkin  !== undefined && { graceMinutes: b.grace_after_checkin }),
        ...(b.grace_before_checkin !== undefined && { graceBeforeCheckin: b.grace_before_checkin }),
        ...(b.grace_before_checkout !== undefined && { graceBeforeCheckout: b.grace_before_checkout }),
        ...(b.grace_after_checkout !== undefined && { graceAfterCheckout: b.grace_after_checkout }),
        ...(b.commission_excludes_tax !== undefined && { commissionExcludesTax: b.commission_excludes_tax }),
        ...(b.todos_id_prefix    !== undefined && { todosIdPrefix: b.todos_id_prefix || null }),
      },
    });
    res.json(serializeSettings(s, await empShiftMap(req.user.business_id)));
  } catch (err) { next(err); }
});

module.exports = router;
