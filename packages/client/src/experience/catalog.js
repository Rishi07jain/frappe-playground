// The guided tours shown in the top-bar menu. The same list is passed into the desk,
// where experience/desk/tours.js holds each tour's steps under the same id.
// Copy follows the Experience Center artifact; see docs/experience-center.md for the
// few lines changed because plain ERPNext has no India Compliance fields.

export const TOUR_MODULES = [
  { key: 'accounting', label: 'Accounting', sidebar: 'Invoicing' },
  { key: 'buying', label: 'Buying', sidebar: 'Buying' },
  { key: 'selling', label: 'Selling', sidebar: 'Selling' },
  { key: 'stock', label: 'Stock', sidebar: 'Stock' },
  { key: 'assets', label: 'Assets', sidebar: 'Assets' },
  { key: 'manufacturing', label: 'Manufacturing', sidebar: 'Manufacturing' },
]

export const TOURS = [
  { id: 'sales-invoice', module: 'accounting', title: 'Create a sales invoice',
    blurb: 'Bill Kaveri Textiles, with GST worked out from their state.' },
  { id: 'payment', module: 'accounting', title: 'Record a customer payment',
    blurb: 'Receive money against an invoice with a payment entry.' },
  { id: 'journal', module: 'accounting', title: 'Post a journal entry',
    blurb: 'Pay office rent from the bank and see both sides reach the ledger.' },

  { id: 'purchase-order', module: 'buying', title: 'Create a purchase order',
    blurb: 'Order Cotton Fabric 60s from Gujarat Yarn Mills and email it to them.' },
  { id: 'purchase-receipt', module: 'buying', title: 'Receive goods against the order',
    blurb: 'Record what arrived at the warehouse. Stock goes up.' },
  { id: 'purchase-invoice', module: 'buying', title: 'Book the supplier’s bill',
    blurb: 'Turn a receipt into a purchase invoice. The payable is created.' },

  { id: 'quotation', module: 'selling', title: 'Send a quotation',
    blurb: 'Quote Cotton Shirt, Medium to Kaveri Textiles and print it.' },
  { id: 'sales-order', module: 'selling', title: 'Turn a quotation into a sales order',
    blurb: 'The customer said yes. Convert the quotation and set a delivery date.' },
  { id: 'delivery-note', module: 'selling', title: 'Deliver the order',
    blurb: 'Create a delivery note from the sales order. Stock goes out.' },

  { id: 'item', module: 'stock', title: 'Add an item',
    blurb: 'Create a product with its GST rate, unit and selling rate.' },
  { id: 'stock-receipt', module: 'stock', title: 'Receive stock into a warehouse',
    blurb: 'Add Cotton Fabric 60s to Stores - DI with a stock entry.' },
  { id: 'stock-transfer', module: 'stock', title: 'Move stock between warehouses',
    blurb: 'Transfer Cotton Fabric 60s from Stores to Work In Progress.' },

  { id: 'asset', module: 'assets', title: 'Register a fixed asset',
    blurb: 'Add a laptop to your asset register and see its depreciation.' },
  { id: 'asset-movement', module: 'assets', title: 'Move an asset to another location',
    blurb: 'Transfer an asset to a new site and person, with a full history.' },

  { id: 'bom', module: 'manufacturing', title: 'Create a bill of materials',
    blurb: 'List what goes into one Cotton Shirt, Medium.' },
  { id: 'work-order', module: 'manufacturing', title: 'Plan production with a work order',
    blurb: 'Tell the shop floor to make 50 Cotton Shirt, Medium.' },
  { id: 'manufacture', module: 'manufacturing', title: 'Finish production',
    blurb: 'Consume raw materials and add finished goods to stock.' },
]

export function toursFor(moduleKey) {
  return TOURS.filter(tour => tour.module === moduleKey)
}
