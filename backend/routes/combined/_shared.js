const prisma = require('../../lib/prisma');

// The assignee must be a user of this business.
async function badAssignee(b, businessId) {
  if (!b.assigned_to_id) return null;
  return (await prisma.user.count({ where: { id: b.assigned_to_id, businessId } })) ? null : 'Assigned user not found';
}

module.exports = { badAssignee };
