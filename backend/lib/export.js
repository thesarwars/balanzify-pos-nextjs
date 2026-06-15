const PDFDocument = require('pdfkit');
const { stringify } = require('csv-stringify/sync');

// ── CSV export ────────────────────────────────────────────────────────────────
const toCSV = (rows, columns) => stringify(rows.map(row =>
  columns.reduce((obj, col) => { obj[col.header] = row[col.key] ?? ''; return obj; }, {})
), { header: true, columns: columns.map(c => c.header) });

const salesCSV = (sales) => toCSV(sales, [
  { header: 'Order #', key: 'sale_number' },
  { header: 'Date', key: 'created_at' },
  { header: 'Customer', key: 'customer_name' },
  { header: 'Cashier', key: 'cashier_name' },
  { header: 'Payment method', key: 'payment_method' },
  { header: 'Subtotal', key: 'subtotal' },
  { header: 'Discount', key: 'discount_amount' },
  { header: 'Total', key: 'total_amount' },
  { header: 'Status', key: 'status' },
]);

const productsCSV = (products) => toCSV(products, [
  { header: 'Name', key: 'name' },
  { header: 'SKU', key: 'sku' },
  { header: 'Barcode', key: 'barcode' },
  { header: 'Category', key: 'category_name' },
  { header: 'Selling price', key: 'selling_price' },
  { header: 'Cost price', key: 'cost_price' },
  { header: 'Wholesale price', key: 'wholesale_price' },
  { header: 'Stock', key: 'total_stock' },
  { header: 'Min stock level', key: 'min_stock_level' },
  { header: 'Reorder point', key: 'reorder_point' },
  { header: 'Unit', key: 'unit_of_measure' },
  { header: 'Active', key: 'is_active' },
]);

const inventoryCSV = (items) => toCSV(items, [
  { header: 'Product', key: 'name' },
  { header: 'SKU', key: 'sku' },
  { header: 'Category', key: 'category' },
  { header: 'Location', key: 'location' },
  { header: 'Stock', key: 'stock' },
  { header: 'Cost value', key: 'cost_value' },
  { header: 'Retail value', key: 'retail_value' },
]);

const stockMovementsCSV = (movements) => toCSV(movements, [
  { header: 'Date', key: 'created_at' },
  { header: 'Product', key: 'product_name' },
  { header: 'Location', key: 'location_name' },
  { header: 'Type', key: 'type' },
  { header: 'Quantity', key: 'quantity' },
  { header: 'Balance after', key: 'balance_after' },
  { header: 'Notes', key: 'notes' },
  { header: 'User', key: 'created_by_name' },
]);

// ── PDF invoice ───────────────────────────────────────────────────────────────
const generateInvoicePDF = (sale, items, business) => new Promise((resolve, reject) => {
  const chunks = [];
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const fmt = (n) => '$' + parseFloat(n || 0).toFixed(2);
  const W = 495; // usable width

  // Header
  if (business.logo_url) {
    try { doc.image(business.logo_url, 50, 45, { width: 80 }); } catch {}
  }
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827').text('INVOICE', 400, 50, { align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor('#6B7280');
  doc.text(business.name, 400, 76, { align: 'right' });
  if (business.address) doc.text(business.address, 400, 90, { align: 'right' });
  if (business.phone) doc.text(business.phone, 400, 104, { align: 'right' });

  // Invoice meta
  doc.moveDown(3);
  const y = doc.y;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Invoice details', 50, y);
  doc.font('Helvetica').fillColor('#6B7280');
  doc.text(`Invoice #: ${sale.sale_number}`, 50, y + 16);
  doc.text(`Date: ${new Date(sale.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, y + 30);
  doc.text(`Payment: ${sale.payment_method}`, 50, y + 44);
  if (sale.customer_name) {
    doc.font('Helvetica-Bold').fillColor('#111827').text('Bill to', 300, y);
    doc.font('Helvetica').fillColor('#6B7280').text(sale.customer_name, 300, y + 16);
    if (sale.customer_phone) doc.text(sale.customer_phone, 300, y + 30);
  }

  // Items table
  doc.moveDown(4);
  const tableTop = doc.y;
  const cols = { item: 50, qty: 280, unitPrice: 350, total: 430 };

  // Table header
  doc.rect(50, tableTop, W, 24).fill('#111827');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
  doc.text('Item', cols.item + 6, tableTop + 7);
  doc.text('Qty', cols.qty + 6, tableTop + 7);
  doc.text('Unit price', cols.unitPrice + 6, tableTop + 7);
  doc.text('Total', cols.total + 6, tableTop + 7);

  // Table rows
  let rowY = tableTop + 24;
  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? '#FAFAFA' : '#fff';
    doc.rect(50, rowY, W, 22).fill(bg);
    doc.fontSize(9).font('Helvetica').fillColor('#111827');
    doc.text(item.product_name, cols.item + 6, rowY + 6, { width: 220, ellipsis: true });
    doc.text(String(item.quantity), cols.qty + 6, rowY + 6);
    doc.text(fmt(item.unit_price), cols.unitPrice + 6, rowY + 6);
    doc.text(fmt(item.total_price), cols.total + 6, rowY + 6);
    rowY += 22;
  });

  // Totals
  rowY += 8;
  doc.moveTo(50, rowY).lineTo(545, rowY).stroke('#E8ECF0');
  rowY += 10;

  const addTotal = (label, value, bold = false, color = '#111827') => {
    doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color);
    doc.text(label, 350, rowY);
    doc.text(value, cols.total + 6, rowY);
    rowY += 18;
  };

  addTotal('Subtotal', fmt(sale.subtotal));
  if (parseFloat(sale.discount_amount) > 0) addTotal('Discount', `-${fmt(sale.discount_amount)}`, false, '#2D6A4F');
  rowY += 4;
  doc.moveTo(340, rowY).lineTo(545, rowY).stroke('#E8ECF0');
  rowY += 8;
  addTotal('Total', fmt(sale.total_amount), true);

  // Footer
  if (business.receipt_footer) {
    doc.moveDown(3);
    doc.fontSize(10).font('Helvetica').fillColor('#9CA3AF').text(business.receipt_footer, 50, doc.y, { align: 'center', width: W });
  }

  doc.end();
});

// ── PDF purchase order ────────────────────────────────────────────────────────
const generatePOPDF = (po, items, business, supplier) => new Promise((resolve, reject) => {
  const chunks = [];
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const fmt = (n) => '$' + parseFloat(n || 0).toFixed(2);
  const W = 495;

  doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827').text('PURCHASE ORDER', 50, 50);
  doc.fontSize(10).font('Helvetica').fillColor('#6B7280');
  doc.text(`PO Number: ${po.po_number}`, 50, 80);
  doc.text(`Date: ${new Date(po.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, 94);
  if (po.expected_delivery) doc.text(`Expected delivery: ${new Date(po.expected_delivery).toLocaleDateString('en-GB')}`, 50, 108);

  doc.font('Helvetica-Bold').fillColor('#111827').text('From', 300, 80);
  doc.font('Helvetica').fillColor('#6B7280').text(business.name, 300, 96);
  if (business.address) doc.text(business.address, 300, 110);

  doc.font('Helvetica-Bold').fillColor('#111827').text('To', 50, 140);
  doc.font('Helvetica').fillColor('#6B7280').text(supplier.name, 50, 156);
  if (supplier.contact_person) doc.text(supplier.contact_person, 50, 170);
  if (supplier.phone) doc.text(supplier.phone, 50, 184);

  const tableTop = 220;
  doc.rect(50, tableTop, W, 24).fill('#111827');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
  doc.text('Product', 56, tableTop + 7);
  doc.text('Qty', 300, tableTop + 7);
  doc.text('Unit price', 360, tableTop + 7);
  doc.text('Total', 436, tableTop + 7);

  let rowY = tableTop + 24;
  items.forEach((item, i) => {
    doc.rect(50, rowY, W, 22).fill(i % 2 === 0 ? '#FAFAFA' : '#fff');
    doc.fontSize(9).font('Helvetica').fillColor('#111827');
    doc.text(item.product_name, 56, rowY + 6, { width: 236, ellipsis: true });
    doc.text(String(item.ordered_qty), 300, rowY + 6);
    doc.text(fmt(item.unit_price), 360, rowY + 6);
    doc.text(fmt(item.total_price), 436, rowY + 6);
    rowY += 22;
  });

  rowY += 10;
  if (parseFloat(po.freight_cost) > 0) { doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text('Freight', 360, rowY); doc.text(fmt(po.freight_cost), 436, rowY); rowY += 16; }
  if (parseFloat(po.customs_duty) > 0) { doc.text('Customs duty', 360, rowY); doc.text(fmt(po.customs_duty), 436, rowY); rowY += 16; }
  rowY += 4;
  doc.moveTo(340, rowY).lineTo(545, rowY).stroke('#E8ECF0');
  rowY += 8;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Total', 360, rowY).text(fmt(po.total_amount), 436, rowY);

  if (po.notes) {
    doc.moveDown(4);
    doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text(`Notes: ${po.notes}`, 50, doc.y);
  }

  doc.end();
});

module.exports = { salesCSV, productsCSV, inventoryCSV, stockMovementsCSV, generateInvoicePDF, generatePOPDF };
