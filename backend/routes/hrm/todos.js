/**
 * HRM — the HR task list.
 */
const {
  HrTodoSchema, StatusSchema, auth, express, loadSettings, nextRef, prisma, serializeTodo,
  validate,
} = require('./_shared');

const router = express.Router();

router.get('/todo', auth, async (req, res, next) => {
  try {
    const todos = await prisma.hrTodo.findMany({ where: { businessId: req.user.business_id }, include: { assignee: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(todos.map(serializeTodo));
  } catch (err) { next(err); }
});

router.post('/todo', auth, validate(HrTodoSchema), async (req, res, next) => {
  try {
    const b = req.body, businessId = req.user.business_id;
    const tset = await loadSettings(businessId);
    const todo = await prisma.hrTodo.create({
      data: { businessId, title: b.title, referenceNo: await nextRef(prisma.hrTodo, businessId, tset.todosIdPrefix), assignedTo: b.assigned_to || null, priority: b.priority || 'medium', dueDate: b.due ? new Date(b.due) : null },
      include: { assignee: { select: { name: true } } },
    });
    res.status(201).json(serializeTodo(todo));
  } catch (err) { next(err); }
});

router.put('/todo/:id', auth, validate(StatusSchema), async (req, res, next) => {
  try {
    const t = await prisma.hrTodo.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.hrTodo.update({ where: { id: req.params.id }, data: { status: req.body.status }, include: { assignee: { select: { name: true } } } });
    res.json(serializeTodo(updated));
  } catch (err) { next(err); }
});

module.exports = router;
