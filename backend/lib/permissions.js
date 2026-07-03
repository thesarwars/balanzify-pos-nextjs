/**
 * Permission catalog — the single source of truth for role permissions.
 * Grouped for the role editor; keys are stable identifiers stored on roles.
 * Adding a permission here makes it assignable everywhere.
 */

const PERMISSION_GROUPS = [
  { group: 'Dashboard & Reports', perms: [
    { key: 'dashboard.view',   label: 'View dashboard' },
    { key: 'reports.view',     label: 'View reports' },
    { key: 'reports.profit',   label: 'View profit & margins' },
    { key: 'export.view',      label: 'Export tables (CSV / PDF)' },
  ]},
  { group: 'POS & Register', perms: [
    { key: 'pos.sell',           label: 'Sell at the POS' },
    { key: 'pos.discount',       label: 'Give manual discounts' },
    { key: 'pos.price_override', label: 'Override selling prices' },
    { key: 'pos.park',           label: 'Park / hold orders' },
    { key: 'pos.refund',         label: 'Process refunds' },
    { key: 'register.open',      label: 'Open the register' },
    { key: 'register.close',     label: 'Close the register' },
  ]},
  { group: 'Sales', perms: [
    { key: 'sale.view',     label: 'View sales history' },
    { key: 'sale.create',   label: 'Create sales / invoices' },
    { key: 'sale.refund',   label: 'Refund sales' },
    { key: 'credit.manage', label: 'Manage credit sales (deyn)' },
    { key: 'coupon.manage', label: 'Manage coupons & discounts' },
    { key: 'loyalty.manage',label: 'Manage loyalty & rewards' },
  ]},
  { group: 'Products & Catalog', perms: [
    { key: 'product.view',      label: 'View products' },
    { key: 'product.create',    label: 'Add products' },
    { key: 'product.edit',      label: 'Edit products' },
    { key: 'product.delete',    label: 'Delete products' },
    { key: 'product.import',    label: 'Import products' },
    { key: 'category.manage',   label: 'Manage categories & brands' },
    { key: 'unit.manage',       label: 'Manage units' },
    { key: 'price_group.manage',label: 'Manage selling price groups' },
  ]},
  { group: 'Stock & Inventory', perms: [
    { key: 'stock.view',        label: 'View stock levels' },
    { key: 'stock.adjust',      label: 'Make stock adjustments' },
    { key: 'stock.transfer',    label: 'Transfer stock between locations' },
    { key: 'stocktake.manage',  label: 'Run stocktakes' },
    { key: 'opening_stock.set', label: 'Set opening stock' },
  ]},
  { group: 'Purchases & Suppliers', perms: [
    { key: 'purchase.view',    label: 'View purchases' },
    { key: 'purchase.create',  label: 'Create purchase orders' },
    { key: 'purchase.receive', label: 'Receive goods (GRN)' },
    { key: 'supplier.view',    label: 'View suppliers' },
    { key: 'supplier.manage',  label: 'Manage suppliers' },
    { key: 'supplier.pay',     label: 'Pay suppliers' },
  ]},
  { group: 'Customers', perms: [
    { key: 'customer.view',         label: 'View customers' },
    { key: 'customer.manage',       label: 'Manage customers' },
    { key: 'customer_group.manage', label: 'Manage customer groups' },
  ]},
  { group: 'Money & Accounting', perms: [
    { key: 'expense.view',           label: 'View expenses' },
    { key: 'expense.manage',         label: 'Record expenses' },
    { key: 'payment_account.manage', label: 'Manage payment accounts' },
    { key: 'petty_cash.manage',      label: 'Manage petty cash' },
    { key: 'accounting.view',        label: 'View ledger & statements' },
    { key: 'journal.post',           label: 'Post manual journal entries' },
  ]},
  { group: 'HRM & Staff', perms: [
    { key: 'hrm.view',            label: 'View HRM' },
    { key: 'hrm.employee.manage', label: 'Manage employees' },
    { key: 'hrm.attendance',      label: 'Record attendance' },
    { key: 'hrm.payroll',         label: 'Run payroll' },
    { key: 'hrm.leave.manage',    label: 'Manage leave' },
  ]},
  { group: 'Settings & Administration', perms: [
    { key: 'settings.manage', label: 'Business settings' },
    { key: 'location.manage', label: 'Manage locations' },
    { key: 'invoice.settings',label: 'Invoice schemes & layouts' },
    { key: 'tax.manage',      label: 'Manage tax rates' },
    { key: 'user.view',       label: 'View users' },
    { key: 'user.manage',     label: 'Add / edit users' },
    { key: 'role.view',       label: 'View roles' },
    { key: 'role.manage',     label: 'Manage roles & permissions' },
    { key: 'module.manage',   label: 'Enable / disable modules' },
  ]},
];

const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

// The five roles every business starts with. Admin gets everything.
const only = (...keys) => keys;
const PREDEFINED_ROLES = [
  { name: 'Admin', permissions: ALL_PERMISSION_KEYS },
  { name: 'Manager', permissions: ALL_PERMISSION_KEYS.filter((k) => !['user.manage', 'role.manage', 'module.manage', 'settings.manage', 'journal.post'].includes(k)) },
  { name: 'Cashier', permissions: only(
    'dashboard.view', 'pos.sell', 'pos.park', 'register.open', 'register.close',
    'sale.view', 'sale.create', 'product.view', 'customer.view',
  )},
  { name: 'Accountant', permissions: only(
    'dashboard.view', 'reports.view', 'reports.profit', 'export.view',
    'sale.view', 'purchase.view', 'supplier.view', 'supplier.pay', 'customer.view',
    'expense.view', 'expense.manage', 'payment_account.manage', 'petty_cash.manage',
    'accounting.view', 'journal.post', 'credit.manage',
  )},
  { name: 'Stock Keeper', permissions: only(
    'dashboard.view', 'product.view', 'product.create', 'product.edit', 'product.import',
    'category.manage', 'unit.manage', 'stock.view', 'stock.adjust', 'stock.transfer',
    'stocktake.manage', 'opening_stock.set', 'purchase.view', 'purchase.create',
    'purchase.receive', 'supplier.view',
  )},
];

// Seed the predefined roles for a business (idempotent per name).
async function seedPredefinedRoles(tx, businessId) {
  for (const r of PREDEFINED_ROLES) {
    await tx.role.create({ data: { businessId, name: r.name, permissions: r.permissions, isPredefined: true } });
  }
}

module.exports = { PERMISSION_GROUPS, ALL_PERMISSION_KEYS, PREDEFINED_ROLES, seedPredefinedRoles };
