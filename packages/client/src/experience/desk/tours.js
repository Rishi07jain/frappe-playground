/* ERPNext Experience Center: the guided tours, ported from the artifact to the real
   ERPNext v16 desk. Every step uses real fieldnames and real Create-menu labels.
   Names (customers, items, warehouses) match the sample data that
   runtime/python/experience_center.py seeds. A tour that continues earlier work
   (payment, receipt, sales order…) opens the newest matching document, so it follows
   on from the previous tour when there is one and from the sample data when not. */
(function () {
  'use strict';
  var EC = window.ECDesk;
  if (!EC) return;

  var ABBR = 'DI';
  var STATE = 'Maharashtra';
  var wh = function (n) { return n + ' - ' + ABBR; };
  var acc = function (n) { return n + ' - ' + ABBR; };
  var inr = function (n) { return EC.inr(n); };

  var STATES = {
    'Sharma Garments': 'Maharashtra', 'Kaveri Textiles': 'Tamil Nadu', 'Patel Fashion House': 'Gujarat',
    'Deccan Retail Co.': 'Telangana', 'Gujarat Yarn Mills': 'Gujarat', 'Shree Dyes & Chemicals': 'Maharashtra',
    'Coimbatore Cotton Co.': 'Tamil Nadu',
  };
  var stateOf = function (party) { return STATES[party] || STATE; };

  /* ---- step builders ---- */
  function start(story) { return { kind: 'start', title: 'Watch ERPNext do it', text: story }; }
  function side(dt) {
    return { kind: 'side', doctype: dt, title: 'Open ' + dt + ' from the sidebar',
      text: 'The sidebar on the left holds everything this module handles. ' + dt + ' opens its list.' };
  }
  function addNew(dt, why) {
    return { kind: 'new', doctype: dt, title: 'Add a new ' + dt,
      text: why || 'A blank ' + dt + ' opens, with today’s date and your company already filled in.' };
  }
  function openNew(dt, why, story) { return [start(story), side(dt), addNew(dt, why)]; }
  function openDoc(dt, name, why, story) {
    return [start(story), side(dt), { kind: 'open', doctype: dt, name: name, title: 'Open the ' + dt,
      text: why || 'It’s at the top of the list. One click opens it.' }];
  }
  function createFrom(target, why, extra) {
    return Object.assign({ kind: 'create', group: 'Create', label: target, doctype: target, title: 'Create the ' + target,
      text: 'In ERPNext one document leads to the next. The Create menu lists what can follow this one. ' +
        (why || 'Customer, items and rates are copied across, so nothing is typed twice.') }, extra || {});
  }
  function field(name, value, title, text, also) { return { kind: 'field', field: name, value: value, title: title, text: text, also: also }; }
  function row(table, index, values, title, text, firstKey) {
    return { kind: 'row', table: table, index: index, values: values, title: title, text: text, firstKey: firstKey };
  }
  function look(target, title, text) { return { kind: 'look', target: target, title: title, text: text }; }
  function save(dt, text) { return { kind: 'save', title: 'Save the ' + dt, text: text || 'Saved as a draft first, so it’s still easy to change.' }; }
  function submit(dt, text) { return { kind: 'submit', title: 'Submit the ' + dt, text: text || 'Submitting makes the ' + dt + ' final and posts it to your books.' }; }
  function done(fn) { return { kind: 'done', text: fn }; }
  function printSteps(what, who) {
    return [
      { kind: 'print', title: 'Open the print view', text: 'Now the part ' + who + ' actually sees. Print opens the document as it will be sent.' },
      look(function () { return document.querySelector('.print-preview-wrapper') || document.querySelector('.print-format'); },
        'The ' + what.toLowerCase() + ', ready to send',
        'Bill-to address, items, taxes and the total in words, laid out on the page. Download it as a PDF or email it from here.'),
    ];
  }
  function taxes(f) { return f && f.fields_dict.taxes ? f.fields_dict.taxes.$wrapper : null; }
  function missing(text) { var a = []; a.missing = text; return a; }

  function qtyFor(rate, budget) {
    var q = budget / (rate || 1);
    return q >= 50 ? Math.round(q / 50) * 50 : Math.max(1, Math.round(q));
  }

  var T = EC.tours;

  /* ---------------------------------------------------------------- Accounting */

  T['sales-invoice'] = { build: function (h) {
    var cust = 'Kaveri Textiles', fg = 'Cotton Shirt, Medium';
    return openNew('Sales Invoice', 'A blank invoice opens, already set up for your company and today’s date.',
      cust + ' took delivery of your ' + fg + ' last week and is waiting for the bill. Let’s send it.').concat([
      field('customer', cust, 'Choose the customer', 'Pick ' + cust + '. Their billing address and tax category come along with the name.'),
      row('items', 0, { item_code: 'SHIRT-CTN-M', qty: qtyFor(650, 80000) }, 'Add what they bought',
        'The ' + fg + ' and the quantity go in. The rate is filled from your price list, and you can still change it on the line if you’ve agreed a different price.'),
      field('due_date', h.addDays(h.today(), 30), 'Set the due date', 'They pay in 30 days. If it slips, the invoice shows up in your overdue receivables on its own.'),
      look(taxes, 'The taxes table fills itself',
        cust + ' is in ' + stateOf(cust) + ' and you are in ' + STATE + ', so ERPNext applies IGST on its own. Nobody has to remember the rule. Rounding and the total in words are done too.'),
      save('Sales Invoice'),
      submit('Sales Invoice', 'Submitting makes it final and posts it to your books: the customer owes you, and the sale and the GST are recorded.'),
    ], printSteps('Invoice', cust), [
      done(function (d) { return 'Invoice ' + d.name + ' for ' + inr(d.rounded_total || d.grand_total) + ' is posted and ready to send.'; }),
    ]);
  } };

  T['payment'] = { build: function (h) {
    return h.latest('Sales Invoice', { docstatus: 1, outstanding_amount: ['>', 0] }).then(function (si) {
      if (!si) return missing('There’s no unpaid sales invoice left. Run “Create a sales invoice” first.');
      return h.value('Sales Invoice', si, 'customer').then(function (cust) {
        return openDoc('Sales Invoice', si, 'Here’s ' + cust + '’s invoice, still unpaid. One click opens it.',
          'Good news: ' + cust + ' just paid their invoice by UPI. Let’s record it.').concat([
          createFrom('Payment Entry', 'The customer and the exact amount come across from the invoice.', { label: 'Payment' }),
          field('mode_of_payment', 'UPI', 'How they paid', 'They paid by UPI, so the money is recorded straight into your bank account.'),
          field('reference_no', 'UTR612730094417', 'Note the UTR', 'We keep their UTR number. When the bank statement comes in, the match takes one click.',
            { reference_date: h.today() }),
          save('Payment Entry'),
          submit('Payment Entry', 'Submitting marks the invoice Paid and takes it off your list of money to chase.'),
          done(function (d) { return 'Payment ' + d.name + ' of ' + inr(d.paid_amount) + ' is recorded. The invoice now shows Paid.'; }),
        ]);
      });
    });
  } };

  T['journal'] = { build: function (h) {
    return openNew('Journal Entry', 'A blank journal entry opens.',
      'It’s the 1st, and ₹85,000 of office rent just left your HDFC account. Rent has no form of its own, and that’s exactly what a journal entry is for.').concat([
      field('voucher_type', 'Bank Entry', 'Pick the entry type', 'A bank entry, because the money went out of the bank.'),
      row('accounts', 0, { account: acc('Office Rent'), debit_in_account_currency: 85000 }, 'Debit the expense',
        'Rent is an expense, so that side is debited…', 'account'),
      row('accounts', 1, { account: acc('HDFC Bank'), credit_in_account_currency: 85000 }, 'Credit the bank',
        '…and the bank is credited, because that’s where the money came from. Both sides use the same figure, so the books always balance.', 'account'),
      field('cheque_no', 'NEFT26100185', 'Note the bank reference',
        'A bank entry carries the transfer’s reference, so reconciling it with the bank statement is one click.', { cheque_date: h.today() }),
      field('user_remark', 'Office rent for this month', 'Add a remark', 'A short note, so anyone reading the ledger next year knows what this was.'),
      save('Journal Entry'),
      submit('Journal Entry', 'Submitting posts both sides to the General Ledger.'),
      done(function (d) { return 'Journal Entry ' + d.name + ' for ' + inr(d.total_debit) + ' is in the ledger.'; }),
    ]);
  } };

  /* ---------------------------------------------------------------- Buying */

  T['purchase-order'] = { build: function (h) {
    var sup = 'Gujarat Yarn Mills', rm = 'Cotton Fabric 60s';
    return openNew('Purchase Order', 'A blank purchase order opens.',
      'Stores just flagged that ' + rm + ' is running low, and ' + sup + ' has the best rate. Let’s place the order and email it to them.').concat([
      field('supplier', sup, 'Choose the supplier', sup + ' is in ' + stateOf(sup) + '. ERPNext tracks the GST you pay them so you can claim it back.'),
      field('schedule_date', h.addDays(h.today(), 10), 'Say when you need it', 'You need it within 10 days. That date shows on every line, so stores knows what’s coming.'),
      row('items', 0, { item_code: 'COT-FAB-60', qty: qtyFor(204, 90000) }, 'Add ' + rm, 'The quantity stores asked for, at the rate from your buying price list.'),
      row('items', 1, { item_code: 'POLY-YRN-30', qty: qtyFor(178, 40000) }, 'Add Polyester Yarn 30D',
        'While we’re at it, one more item from the same supplier. One order can carry everything.'),
      save('Purchase Order'),
      submit('Purchase Order', 'Submitting confirms the order. Stock and accounts don’t move yet: that happens when the goods arrive.'),
      { kind: 'email', title: 'The email is drafted for you',
        text: 'A subject with the order number, a short note, and the order attached as a PDF. In your own ERPNext, the supplier’s address fills in from their contact, and a copy stays on the order’s timeline. Nothing is sent from the Experience Center, so we’ll close it here.',
        onLeave: function () { if (window.cur_dialog) cur_dialog.hide(); } },
      done(function (d) { return 'Purchase Order ' + d.name + ' for ' + inr(d.rounded_total || d.grand_total) + ' is placed with ' + d.supplier + '.'; }),
    ]);
  } };

  T['purchase-receipt'] = { build: function (h) {
    return h.latest('Purchase Order', { docstatus: 1, per_received: ['<', 100], status: ['not in', ['Closed', 'On Hold']] }).then(function (po) {
      if (!po) return missing('Every purchase order has been received. Run “Create a purchase order” first.');
      return h.value('Purchase Order', po, 'supplier').then(function (sup) {
        return openDoc('Purchase Order', po, 'Here’s the order the goods belong to.',
          'A truck from ' + sup + ' just pulled in at the gate. Let’s receive the goods against your order.').concat([
          createFrom('Purchase Receipt', 'Supplier, items, quantities and rates come across from the order.'),
          field('set_warehouse', wh('Stores'), 'Choose the warehouse', 'Everything goes into Stores, and that warehouse’s balance goes up the moment we submit.'),
          field('supplier_delivery_note', 'DC/DI/0318', 'Note their challan', 'We keep the supplier’s delivery challan number, in case anything needs checking later.'),
          save('Purchase Receipt'),
          submit('Purchase Receipt', 'Submitting adds the stock and marks the order as received.'),
          done(function (d) { return 'Purchase Receipt ' + d.name + ' is posted. The goods are in ' + (d.set_warehouse || wh('Stores')) + '.'; }),
        ]);
      });
    });
  } };

  T['purchase-invoice'] = { build: function (h) {
    return h.latest('Purchase Receipt', { docstatus: 1, per_billed: ['<', 100], status: ['not in', ['Closed']] }).then(function (pr) {
      if (!pr) return missing('Every receipt has been billed. Run “Receive goods against the order” first.');
      return h.value('Purchase Receipt', pr, 'supplier').then(function (sup) {
        return openDoc('Purchase Receipt', pr, 'Here’s what we actually received.',
          sup + '’s bill just landed in the inbox. Let’s book it against what actually arrived.').concat([
          createFrom('Purchase Invoice', 'Items and rates come from the receipt, so you only pay for what you got.'),
          field('bill_no', 'INV/26-27/0412', 'Enter their invoice number', 'Their bill number. If the same bill is ever entered twice, ERPNext stops you.',
            { bill_date: h.today() }),
          field('due_date', h.addDays(h.today(), 45), 'Set the due date', 'You pay in 45 days. It shows up in Accounts Payable so it’s never missed.'),
          look(taxes, 'Input GST, ready to claim', 'The GST on this bill goes to your input tax accounts, ready to set off against what you collect.'),
          save('Purchase Invoice'),
          submit('Purchase Invoice', 'Submitting records what you owe the supplier in your books.'),
          done(function (d) { return 'Purchase Invoice ' + d.name + ' for ' + inr(d.rounded_total || d.grand_total) + ' is booked against ' + d.supplier + '.'; }),
        ]);
      });
    });
  } };

  /* ---------------------------------------------------------------- Selling */

  T['quotation'] = { build: function () {
    var cust = 'Kaveri Textiles', fg = 'Cotton Shirt, Medium', fg2 = 'Linen Kurta, Large';
    return openNew('Quotation', 'A blank quotation opens, ready to fill.',
      cust + ' from ' + stateOf(cust) + ' just called asking for a price on ' + fg + ' and ' + fg2 + '. Let’s get them a quote before they call anyone else.').concat([
      field('party_name', cust, 'Choose the customer',
        'They’re in ' + stateOf(cust) + ' and you’re in ' + STATE + ', so IGST applies instead of CGST and SGST. ERPNext handles that for you.'),
      row('items', 0, { item_code: 'SHIRT-CTN-M', qty: qtyFor(650, 120000) }, 'Add ' + fg,
        'The quantity they asked for. The rate comes from your price list, so every salesperson quotes the same price.'),
      row('items', 1, { item_code: 'KURTA-LIN-L', qty: qtyFor(1190, 60000) }, 'Add ' + fg2, 'And the second product. A quote can carry as many lines as the deal needs.'),
      look(taxes, 'GST is calculated for you', 'Tax on each item at its own GST rate, rounding, and the total in words. Ready to send.'),
      save('Quotation'),
      submit('Quotation', 'Submitting makes the quote final, so it can be sent and later turned into a sales order.'),
    ], printSteps('Quotation', cust), [
      done(function (d) { return 'Quotation ' + d.name + ' for ' + inr(d.rounded_total || d.grand_total) + ' is ready to send to ' + (d.customer_name || d.party_name) + '.'; }),
    ]);
  } };

  T['sales-order'] = { build: function (h) {
    return h.latest('Quotation', { docstatus: 1, status: ['in', ['Open', 'Replied', 'Partially Ordered']] }).then(function (q) {
      if (!q) return missing('Every quotation has been ordered. Run “Send a quotation” first.');
      return h.value('Quotation', q, 'customer_name').then(function (cust) {
        return openDoc('Quotation', q, 'Here’s the quote they accepted.',
          cust + ' said yes to your quote! Let’s confirm the order without typing a single line again.').concat([
          createFrom('Sales Order', 'Everything from the quote comes across: customer, items, prices and taxes.'),
          field('delivery_date', h.addDays(h.today(), 10), 'Promise a delivery date', 'You promise delivery in 10 days. The order appears on your “to deliver” list until it ships.'),
          field('po_no', 'PO/DI/2026/0418', 'Add their PO number', 'Their purchase order number travels with every document that follows, so their accounts team can match it.'),
          save('Sales Order'),
          submit('Sales Order', 'Submitting confirms the order, and the quotation is marked Ordered on its own.'),
          done(function (d) { return 'Sales Order ' + d.name + ' is confirmed. It now waits to be delivered and billed.'; }),
        ]);
      });
    });
  } };

  T['delivery-note'] = { build: function (h) {
    return h.latest('Sales Order', { docstatus: 1, per_delivered: ['<', 100], status: ['not in', ['Closed', 'On Hold', 'Completed']] }).then(function (so) {
      if (!so) return missing('Every sales order has been delivered. Run “Turn a quotation into a sales order” first.');
      return h.value('Sales Order', so, 'customer_name').then(function (cust) {
        return openDoc('Sales Order', so, 'Here’s the order going out today.',
          'The order for ' + cust + ' is packed and the truck is waiting. Let’s ship it.').concat([
          createFrom('Delivery Note', 'Customer, items and quantities come straight from the order.'),
          field('set_warehouse', wh('Stores'), 'Choose where it ships from', 'The goods leave Stores, and that stock goes down the moment we submit.'),
          field('lr_no', '3412 8890 1276', 'Add the e-Way Bill', 'Goods over ₹50,000 on the road need an e-Way Bill, and its number goes right on the delivery note.'),
          save('Delivery Note'),
          submit('Delivery Note', 'Submitting reduces stock and marks the order delivered.'),
          done(function (d) { return 'Delivery Note ' + d.name + ' is posted. The order now waits only for its invoice.'; }),
        ]);
      });
    });
  } };

  /* ---------------------------------------------------------------- Stock */

  T['item'] = { build: function (h) {
    var name = 'Cotton Shirt, Medium (Bulk Pack)', base = 'SHIRT-CTN-M-BULK';
    function freeCode(n) {
      var code = n === 1 ? base : base + '-' + n;
      return h.exists('Item', code).then(function (taken) { return taken ? freeCode(n + 1) : code; });
    }
    return Promise.all([freeCode(1), h.value('Item Tax Template', { title: 'GST 5%' }, 'name')]).then(function (r) {
      var code = r[0], gst = r[1];
      return openNew('Item', 'A blank item opens.',
        'You’re launching ' + name + '. Before you can buy, stock or sell it, it needs a place in ERPNext.').concat([
        field('item_code', code, 'Give it a code', 'A short, unique code that will appear on every order and invoice.'),
        field('item_name', name, 'Name it', 'The name your customers will see on quotes and bills.'),
        field('item_group', 'Products', 'Pick its group', 'It goes under Products, which keeps reports and pricing rules tidy.'),
        field('stock_uom', 'Nos', 'Choose the unit', 'Stock is counted in Nos.'),
        field('standard_rate', 1170, 'Set the selling price', 'This becomes its price in your Standard Selling price list, so every quote picks it up.'),
        row('taxes', 0, { item_tax_template: gst }, 'Choose its GST rate',
          'The 5% GST template. Every order and invoice applies this rate to the item on its own.', 'item_tax_template'),
        save('Item', 'Once saved, the item is ready to buy, stock and sell.'),
        done(function (d) { return d.item_name + ' (' + d.name + ') is in your item list.'; }),
      ]);
    });
  } };

  T['stock-receipt'] = { build: function () {
    var it = 'Cotton Fabric 60s';
    return openNew('Stock Entry', 'A blank stock entry opens.',
      'You’re moving to ERPNext mid-year, and there’s ' + it + ' already sitting on your shelves. Let’s bring that stock in.').concat([
      field('stock_entry_type', 'Material Receipt', 'Pick the movement', 'Material Receipt adds stock that didn’t come from a purchase order, like opening stock.'),
      field('to_warehouse', wh('Stores'), 'Choose the warehouse', 'It all goes into Stores. Each warehouse keeps its own count.'),
      row('items', 0, { item_code: 'COT-FAB-60', qty: qtyFor(240, 50000) }, 'Add what’s on the shelf',
        'The ' + it + ' and how much of it there is, valued at what you paid.'),
      save('Stock Entry'),
      submit('Stock Entry', 'Submitting updates the stock ledger and the stock value in your books.'),
      done(function (d) { return 'Stock Entry ' + d.name + ' is posted. Stock Balance shows the new quantity.'; }),
    ]);
  } };

  T['stock-transfer'] = { build: function () {
    var it = 'Cotton Fabric 60s';
    return openNew('Stock Entry', 'A blank stock entry opens.',
      'The production floor needs ' + it + ' today. Let’s move it out of Stores so everyone knows where it is.').concat([
      field('stock_entry_type', 'Material Transfer', 'Pick Material Transfer', 'A transfer moves stock between places without changing what it’s worth.'),
      field('from_warehouse', wh('Stores'), 'Where it leaves from', 'It leaves Stores…'),
      field('to_warehouse', wh('Work In Progress'), 'Where it goes', '…and lands in Work In Progress, right where production needs it.'),
      row('items', 0, { item_code: 'COT-FAB-60', qty: qtyFor(240, 20000) }, 'Add what’s moving', 'The ' + it + ' and how much of it goes to the floor.'),
      save('Stock Entry'),
      submit('Stock Entry', 'Submitting updates both warehouses at once.'),
      done(function (d) { return 'Stock Entry ' + d.name + ' moved stock from ' + d.from_warehouse + ' to ' + d.to_warehouse + '.'; }),
    ]);
  } };

  /* ---------------------------------------------------------------- Assets */

  T['asset'] = { build: function (h) {
    return openNew('Asset', 'A blank asset opens.',
      'Your accounts team just got a new ₹78,000 laptop. It isn’t an expense, it’s an asset, and it should lose value over three years. Let’s set that up.').concat([
      field('asset_type', 'Existing Asset', 'Say how it was bought', 'The laptop was bought outside ERPNext, so it goes in as an existing asset. A laptop bought through a purchase invoice would link to that bill instead.'),
      field('item_code', 'Laptop - Dell Latitude 5440', 'Pick the asset item', 'The laptop model, which is marked as a fixed asset in your item list.'),
      field('asset_name', 'Laptop for Accounts Team', 'Name it', 'A name your team will recognise when they see it in the register.'),
      field('asset_category', 'Computers', 'Choose the category', 'Computers. The category carries the accounts, so nobody sets them each time.'),
      field('location', 'Head Office', 'Say where it is', 'It sits at Head Office, so you can count assets site by site.'),
      field('net_purchase_amount', 78000, 'Enter what it cost', '₹78,000. Depreciation is worked out from this amount.',
        { purchase_date: h.today(), available_for_use_date: h.today() }),
      field('calculate_depreciation', 1, 'Turn on depreciation', 'One tick, and ERPNext works out how the laptop loses value.'),
      row('finance_books', 0, {
        depreciation_method: 'Straight Line', total_number_of_depreciations: 36, frequency_of_depreciation: 1,
        depreciation_start_date: h.monthEnd(),
      }, 'Depreciation is planned', 'Straight line over 36 months. ERPNext lays out the schedule and posts the depreciation every month. Nobody has to remember.', 'depreciation_method'),
      save('Asset'),
      submit('Asset', 'Submitting puts it in your asset register and starts the schedule.'),
      done(function (d) { return 'Asset ' + d.name + ' (' + d.asset_name + ') is in your register.'; }),
    ]);
  } };

  T['asset-movement'] = { build: function (h) {
    return h.latest('Asset', { docstatus: 1, status: ['not in', ['Sold', 'Scrapped', 'Capitalized']] }).then(function (a) {
      if (!a) return missing('There’s no asset to move yet. Run “Register a fixed asset” first.');
      return Promise.all([
        h.value('Asset', a, 'asset_name'), h.value('Asset', a, 'location'),
        h.value('Employee', { employee_name: 'Farhan Shaikh' }, 'name'),
      ]).then(function (r) {
        var nm = r[0], to = r[1] === 'Factory' ? 'Warehouse' : 'Factory', emp = r[2];
        return openDoc('Asset', a, 'Here’s the asset that’s moving.',
          nm + ' is moving to the ' + to + ', and Farhan will be responsible for it. Let’s record that so the register stays true.').concat([
          createFrom('Asset Movement', 'The asset and where it is now are filled in.', { group: 'Actions', label: 'Transfer Asset',
            title: 'Transfer the asset', text: 'The Actions menu holds what you can do with an asset. Transfer Asset starts a movement with the asset and where it is now already filled in.' }),
          field('purpose', 'Transfer', 'Say why it’s moving', 'A transfer: it changes place and hands, and stays in the company.'),
          row('assets', 0, { target_location: to }, 'Choose the new location', 'It’s headed to the ' + to + '.', 'asset'),
          row('assets', 0, { to_employee: emp }, 'Choose the new custodian', 'Farhan takes charge of it from today.', 'asset'),
          save('Asset Movement'),
          submit('Asset Movement', 'Submitting updates where the asset is and who has it. Its value doesn’t change.'),
          done(function (d) { return 'Asset Movement ' + d.name + ' is recorded. The asset is now at the ' + to + '.'; }),
        ]);
      });
    });
  } };

  /* ---------------------------------------------------------------- Manufacturing */

  T['bom'] = { build: function () {
    var fg = 'Cotton Shirt, Medium';
    return openNew('BOM', 'A blank bill of materials opens.',
      'Every ' + fg + ' you make uses the same materials. Let’s write the recipe down once, and ERPNext will use it for every order, cost and plan.').concat([
      field('item', 'SHIRT-CTN-M', 'Choose what you make', fg + ' is the finished product.'),
      field('quantity', 1, 'Say for how many', 'The recipe is for one unit. ERPNext scales it for any batch size.'),
      row('items', 0, { item_code: 'COT-FAB-60', qty: 1.6 }, 'Add the main material', 'How much Cotton Fabric 60s goes into one shirt.'),
      row('items', 1, { item_code: 'BTN-PACK-100', qty: 0.08 }, 'Add the consumables', 'Buttons go in too, so the cost per unit is complete.'),
      save('BOM'),
      submit('BOM', 'Submitting makes the BOM active, so work orders can use it.'),
      done(function (d) { return 'BOM ' + d.name + ' is active. Material cost per unit is ' + inr(d.raw_material_cost) + '.'; }),
    ]);
  } };

  T['work-order'] = { build: function (h) {
    return h.latest('BOM', { docstatus: 1, is_active: 1, item: 'SHIRT-CTN-M' }).then(function (b) {
      if (!b) return missing('There’s no active BOM yet. Run “Create a bill of materials” first.');
      return openDoc('BOM', b, 'Here’s the recipe we’ll make from.',
        'Sales needs 50 Cotton Shirt, Medium by next week. Let’s tell the shop floor, starting from the recipe.').concat([
        createFrom('Work Order', 'ERPNext asks how many to make, then fills in the product, its BOM and every material.', { dialog: { qty: 50 } }),
        field('qty', 50, 'Say how many to make', '50 units. The materials list below scales up to match.'),
        field('skip_transfer', 1, 'Use materials straight from Stores', 'Materials are taken from Stores when production finishes, so there’s no separate transfer step.',
          { source_warehouse: wh('Stores') }),
        field('planned_start_date', h.addDays(h.today(), 1) + ' 09:00:00', 'Pick a start date', 'Production starts tomorrow, and it shows on the planning calendar.'),
        field('fg_warehouse', wh('Finished Goods'), 'Choose where finished units go', 'Finished units go into Finished Goods, ready to ship.'),
        save('Work Order'),
        submit('Work Order', 'Submitting releases the work order to the shop floor.'),
        done(function (d) { return 'Work Order ' + d.name + ' for ' + d.qty + ' units is released to the floor.'; }),
      ]);
    });
  } };

  T['manufacture'] = { build: function (h) {
    return h.latest('Work Order', { docstatus: 1, skip_transfer: 1, status: ['in', ['Not Started', 'In Process']] }).then(function (wo) {
      if (!wo) return missing('There’s no work order waiting to finish. Run “Plan production with a work order” first.');
      return openDoc('Work Order', wo, 'Here’s the work order that just finished.',
        'The shop floor finished the batch. Let’s record it: materials out, finished products in.').concat([
        createFrom('Stock Entry', '', { group: null, label: 'Finish', title: 'Press Finish',
          text: 'Finish asks how many units were made, then fills in a Manufacture stock entry from the work order.' }),
        look(function (f) { return f && f.fields_dict.items ? f.fields_dict.items.$wrapper : null; }, 'Materials out, product in',
          'Raw materials are used up and the finished product is added, all in one entry.'),
        save('Stock Entry'),
        submit('Stock Entry', 'Submitting updates stock and marks the work order Completed.'),
        done(function (d) { return 'Stock Entry ' + d.name + ' is posted. Work Order ' + d.work_order + ' is Completed.'; }),
      ]);
    });
  } };
})();
