/**
 * HTML escaping for server-rendered public pages.
 *
 * Any value that originates from user/tenant input (business name, customer
 * name, product name, receipt footer, plan description, …) MUST be passed
 * through escapeHtml() before being interpolated into an HTML template string.
 * These pages are served unauthenticated, so an un-escaped field is a stored
 * XSS vector for anyone who opens the link.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
