"""ERPNext Experience Center: sample data for the guided tours.

Installed into the frappe package at worker start (see request-handler.js), so it is
callable as /api/method/frappe.experience_center.<fn>. Everything here only runs for a
signed-in System Manager, and every stage is idempotent: a stage that already ran is
skipped, and a record that already exists is reused.

The data mirrors the Experience Center artifact: Demo Industries Pvt Ltd (Maharashtra),
textile customers in four states, three suppliers, seven items, and the open documents
each guided tour starts from (an unpaid invoice, an open purchase order, and so on).
"""

import frappe
from frappe.utils import add_days, getdate, nowdate

COMPANY = "Demo Industries Pvt Ltd"
ABBR = "DI"
COMPANY_STATE = "Maharashtra"
STAGES = ["masters", "stock", "selling", "buying", "manufacturing", "assets"]
DONE_KEY = "experience_center_seed_{0}"

CUSTOMERS = [
	# name, type, group, state, city
	("Sharma Garments", "Company", "Commercial", "Maharashtra", "Mumbai"),
	("Kaveri Textiles", "Company", "Commercial", "Tamil Nadu", "Chennai"),
	("Patel Fashion House", "Company", "Commercial", "Gujarat", "Surat"),
	("Deccan Retail Co.", "Company", "Commercial", "Telangana", "Hyderabad"),
	("Walk In Customer", "Individual", "Individual", "Maharashtra", "Mumbai"),
]
SUPPLIERS = [
	("Gujarat Yarn Mills", "Raw Material", "Gujarat", "Ahmedabad"),
	("Shree Dyes & Chemicals", "Raw Material", "Maharashtra", "Bhiwandi"),
	("Coimbatore Cotton Co.", "Raw Material", "Tamil Nadu", "Coimbatore"),
]
ITEMS = [
	# code, name, group, uom, selling rate, gst %
	("COT-FAB-60", "Cotton Fabric 60s", "Raw Material", "Meter", 240, 5),
	("DNM-FAB-12", "Denim Fabric 12 oz", "Raw Material", "Meter", 320, 5),
	("POLY-YRN-30", "Polyester Yarn 30D", "Raw Material", "Kg", 210, 5),
	("DYE-RED-25", "Reactive Dye Red (25 kg)", "Consumable", "Kg", 760, 18),
	("BTN-PACK-100", "Shirt Buttons (pack of 100)", "Consumable", "Nos", 90, 18),
	("SHIRT-CTN-M", "Cotton Shirt, Medium", "Products", "Nos", 650, 5),
	("KURTA-LIN-L", "Linen Kurta, Large", "Products", "Nos", 1190, 5),
]
SERVICES = [
	("SRV-CONSULT", "Consulting Services", "Services", "Hour", 1500, 18),
]
ASSET_ITEMS = [
	# code, category
	("Laptop - Dell Latitude 5440", "Computers"),
	("CNC Lathe Machine", "Plant and Machinery"),
	("Office Furniture Set", "Furniture"),
]
ASSET_CATEGORIES = [
	# name, fixed asset account (standard chart)
	("Computers", "Electronic Equipment"),
	("Plant and Machinery", "Plants and Machineries"),
	("Furniture", "Furniture and Fixtures"),
]
LOCATIONS = ["Head Office", "Factory", "Warehouse"]
EMPLOYEES = [("Farhan", "Shaikh", "Male"), ("Vikram", "Mehta", "Male"), ("Ananya", "Rao", "Female")]


# ---------------------------------------------------------------- helpers


def acc(name):
	return f"{name} - {ABBR}"


def wh(name):
	return f"{name} - {ABBR}"


def today():
	return getdate(nowdate())


def back(days):
	"""A date `days` ago, but never before the start of the current fiscal year."""
	from erpnext.accounts.utils import get_fiscal_year

	fy_start = getdate(get_fiscal_year(today(), company=COMPANY)[1])
	return max(getdate(add_days(today(), -days)), fy_start)


def insert(doc, submit=False):
	d = frappe.get_doc(doc)
	d.flags.ignore_permissions = True
	d.insert()
	if submit:
		d.submit()
	return d


def ensure(doctype, name, doc):
	if frappe.db.exists(doctype, name):
		return frappe.get_doc(doctype, name)
	return insert({"doctype": doctype, **doc})


def first(doctype, filters):
	return frappe.db.get_value(doctype, filters, "name")


def gst_category(state):
	return "In-State" if state == COMPANY_STATE else "Out-State"


def add_address(title, link_doctype, link_name, state, city, company_address=False):
	if frappe.db.exists("Dynamic Link", {"parenttype": "Address", "link_doctype": link_doctype, "link_name": link_name}):
		return
	insert(
		{
			"doctype": "Address",
			"address_title": title,
			"address_type": "Billing",
			"address_line1": f"{title}, Main Road",
			"city": city,
			"state": state,
			"country": "India",
			"is_primary_address": 1,
			"is_shipping_address": 1,
			"is_your_company_address": 1 if company_address else 0,
			"links": [{"link_doctype": link_doctype, "link_name": link_name}],
		}
	)


def make_account(name, parent, account_type="Tax"):
	if frappe.db.exists("Account", acc(name)):
		return acc(name)
	return insert(
		{
			"doctype": "Account",
			"account_name": name,
			"parent_account": parent,
			"company": COMPANY,
			"account_type": account_type,
			"is_group": 0,
		}
	).name


def group_or(*names):
	"""The first of `names` that is a group account in the company."""
	for n in names:
		if frappe.db.get_value("Account", acc(n), "is_group"):
			return acc(n)
	frappe.throw(f"None of these group accounts exist: {names}")


def done(stage):
	return bool(frappe.db.get_default(DONE_KEY.format(stage)))


def mark_done(stage):
	frappe.db.set_default(DONE_KEY.format(stage), "1")


def rate_of(code, price_list="Standard Selling"):
	return frappe.db.get_value("Item Price", {"item_code": code, "price_list": price_list}, "price_list_rate") or 0


def tax_template(doctype, state):
	return first(doctype, {"company": COMPANY, "tax_category": gst_category(state)})


def party_state(doctype, name):
	return {**{c[0]: c[3] for c in CUSTOMERS}, **{s[0]: s[2] for s in SUPPLIERS}}.get(name, COMPANY_STATE)


def with_taxes(doc):
	"""Fill taxes from the GST template the Tax Rules would pick for this party."""
	is_sales = doc["doctype"] in ("Quotation", "Sales Order", "Sales Invoice", "Delivery Note")
	party = doc.get("customer") or doc.get("party_name") or doc.get("supplier")
	master = "Sales Taxes and Charges Template" if is_sales else "Purchase Taxes and Charges Template"
	doc["taxes_and_charges"] = tax_template(master, party_state("Customer" if is_sales else "Supplier", party))
	d = frappe.get_doc(doc)
	d.append_taxes_from_master(master)
	return d


def insert_tx(doc, submit=True):
	d = with_taxes(doc) if doc["doctype"] not in ("Stock Entry", "BOM", "Work Order") else frappe.get_doc(doc)
	d.flags.ignore_permissions = True
	d.insert()
	if submit:
		d.submit()
	return d


# ---------------------------------------------------------------- stages


def seed_masters():
	company = frappe.get_doc("Company", COMPANY)
	add_address(COMPANY, "Company", COMPANY, COMPANY_STATE, "Mumbai", company_address=True)

	# Settings that keep the sandbox forgiving.
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
	frappe.db.set_single_value("Accounts Settings", "determine_address_tax_category_from", "Billing Address")

	# GST accounts, templates and the rules that pick them from the party's state.
	out_parent = group_or("Duties and Taxes")
	in_parent = group_or("Tax Assets", "Current Assets")
	out = {k: make_account(f"Output Tax {k}", out_parent) for k in ("CGST", "SGST", "IGST")}
	inp = {k: make_account(f"Input Tax {k}", in_parent) for k in ("CGST", "SGST", "IGST")}

	for title in ("In-State", "Out-State"):
		ensure("Tax Category", title, {"title": title})

	def rows(accounts, keys, rate, purchase=False):
		out_rows = []
		for k in keys:
			r = {"charge_type": "On Net Total", "account_head": accounts[k], "description": k, "rate": rate}
			if purchase:
				r.update({"category": "Total", "add_deduct_tax": "Add"})
			out_rows.append(r)
		return out_rows

	templates = [
		("Sales Taxes and Charges Template", "Output GST In-state", "In-State", rows(out, ("CGST", "SGST"), 9)),
		("Sales Taxes and Charges Template", "Output GST Out-state", "Out-State", rows(out, ("IGST",), 18)),
		("Purchase Taxes and Charges Template", "Input GST In-state", "In-State", rows(inp, ("CGST", "SGST"), 9, True)),
		("Purchase Taxes and Charges Template", "Input GST Out-state", "Out-State", rows(inp, ("IGST",), 18, True)),
	]
	for doctype, title, category, taxes in templates:
		if not first(doctype, {"title": title, "company": COMPANY}):
			insert({"doctype": doctype, "title": title, "company": COMPANY, "tax_category": category, "taxes": taxes})

	for tax_type, master_field, master in (
		("Sales", "sales_tax_template", "Sales Taxes and Charges Template"),
		("Purchase", "purchase_tax_template", "Purchase Taxes and Charges Template"),
	):
		for category in ("In-State", "Out-State"):
			if not first("Tax Rule", {"tax_type": tax_type, "tax_category": category, "company": COMPANY}):
				insert(
					{
						"doctype": "Tax Rule",
						"tax_type": tax_type,
						"tax_category": category,
						master_field: first(master, {"company": COMPANY, "tax_category": category}),
						"company": COMPANY,
						"priority": 1,
					}
				)

	item_tax = {}
	for pct in (5, 18):
		title = f"GST {pct}%"
		name = first("Item Tax Template", {"title": title, "company": COMPANY})
		if not name:
			half = pct / 2
			taxes = [
				{"tax_type": out["CGST"], "tax_rate": half},
				{"tax_type": out["SGST"], "tax_rate": half},
				{"tax_type": out["IGST"], "tax_rate": pct},
				{"tax_type": inp["CGST"], "tax_rate": half},
				{"tax_type": inp["SGST"], "tax_rate": half},
				{"tax_type": inp["IGST"], "tax_rate": pct},
			]
			name = insert({"doctype": "Item Tax Template", "title": title, "company": COMPANY, "taxes": taxes}).name
		item_tax[pct] = name

	# UPI as a bank payment mode, landing in the HDFC account.
	bank = first("Account", {"company": COMPANY, "account_type": "Bank", "is_group": 0})
	if not frappe.db.exists("Mode of Payment", "UPI"):
		insert(
			{
				"doctype": "Mode of Payment",
				"mode_of_payment": "UPI",
				"type": "Bank",
				"accounts": [{"company": COMPANY, "default_account": bank}] if bank else [],
			}
		)

	# Parties.
	for name, ctype, group, state, city in CUSTOMERS:
		if not frappe.db.exists("Customer", {"customer_name": name}):
			c = insert(
				{
					"doctype": "Customer",
					"customer_name": name,
					"customer_type": ctype,
					"customer_group": group,
					"tax_category": gst_category(state),
				}
			)
			add_address(name, "Customer", c.name, state, city)
	for name, group, state, city in SUPPLIERS:
		if not frappe.db.exists("Supplier", {"supplier_name": name}):
			s = insert(
				{
					"doctype": "Supplier",
					"supplier_name": name,
					"supplier_type": "Company",
					"supplier_group": group,
					"tax_category": gst_category(state),
				}
			)
			add_address(name, "Supplier", s.name, state, city)

	# Items with GST templates and prices.
	for code, name, group, uom, sell, pct in ITEMS + SERVICES:
		stock = group != "Services"
		ensure(
			"Item",
			code,
			{
				"item_code": code,
				"item_name": name,
				"item_group": group,
				"stock_uom": uom,
				"is_stock_item": 1 if stock else 0,
				"valuation_rate": round(sell * 0.62, 2),
				"description": name,
				"item_defaults": [{"company": COMPANY, "default_warehouse": wh("Stores") if stock else None}],
				"taxes": [{"item_tax_template": item_tax[pct]}],
			},
		)
		for price_list, rate in (("Standard Selling", sell), ("Standard Buying", round(sell * 0.85))):
			if not frappe.db.exists("Item Price", {"item_code": code, "price_list": price_list}):
				insert(
					{
						"doctype": "Item Price",
						"item_code": code,
						"uom": uom,
						"price_list": price_list,
						"price_list_rate": rate,
					}
				)

	# Assets: locations, categories with accounts, fixed-asset items, people.
	for loc in LOCATIONS:
		ensure("Location", loc, {"location_name": loc})
	for cat, fixed_account in ASSET_CATEGORIES:
		ensure(
			"Asset Category",
			cat,
			{
				"asset_category_name": cat,
				"accounts": [
					{
						"company_name": COMPANY,
						"fixed_asset_account": acc(fixed_account),
						"accumulated_depreciation_account": acc("Accumulated Depreciation"),
						"depreciation_expense_account": acc("Depreciation"),
					}
				],
			},
		)
	for code, cat in ASSET_ITEMS:
		ensure(
			"Item",
			code,
			{
				"item_code": code,
				"item_name": code,
				"item_group": "Products",
				"stock_uom": "Nos",
				"is_stock_item": 0,
				"is_fixed_asset": 1,
				"asset_category": cat,
			},
		)
	for first_name, last_name, gender in EMPLOYEES:
		if not frappe.db.exists("Employee", {"employee_name": f"{first_name} {last_name}"}):
			insert(
				{
					"doctype": "Employee",
					"first_name": first_name,
					"last_name": last_name,
					"gender": gender,
					"company": COMPANY,
					"status": "Active",
					"date_of_birth": "1992-05-14",
					"date_of_joining": "2022-04-01",
				}
			)

	# Company defaults used by assets and work orders, filled only where setup left them empty.
	for field, value, doctype in (
		("accumulated_depreciation_account", acc("Accumulated Depreciation"), "Account"),
		("depreciation_expense_account", acc("Depreciation"), "Account"),
		("default_wip_warehouse", wh("Work In Progress"), "Warehouse"),
		("default_fg_warehouse", wh("Finished Goods"), "Warehouse"),
	):
		if company.meta.get_field(field) and not company.get(field) and frappe.db.exists(doctype, value):
			frappe.db.set_value("Company", COMPANY, field, value)


def uom_of(code):
	return frappe.db.get_value("Item", code, "stock_uom")


def se_row(code, qty, rate, target):
	uom = uom_of(code)
	return {
		"item_code": code,
		"qty": qty,
		"basic_rate": rate,
		"t_warehouse": target,
		"uom": uom,
		"stock_uom": uom,
		"conversion_factor": 1,
	}


def seed_stock():
	insert_tx(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": COMPANY,
			"set_posting_time": 1,
			"posting_date": back(60),
			"to_warehouse": wh("Stores"),
			"items": [
				se_row(c, q, round(rate_of(c, "Standard Buying") or 100), wh("Stores"))
				for c, q in (("COT-FAB-60", 3200), ("DNM-FAB-12", 1800), ("POLY-YRN-30", 650), ("DYE-RED-25", 90), ("BTN-PACK-100", 400))
			],
		}
	)
	insert_tx(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": COMPANY,
			"set_posting_time": 1,
			"posting_date": back(58),
			"to_warehouse": wh("Finished Goods"),
			"items": [
				se_row("SHIRT-CTN-M", 420, 405, wh("Finished Goods")),
				se_row("KURTA-LIN-L", 160, 740, wh("Finished Goods")),
			],
		}
	)


def sell_items(*pairs):
	return [{"item_code": c, "qty": q, "rate": rate_of(c)} for c, q in pairs]


def buy_items(*pairs, warehouse=None):
	rows = [{"item_code": c, "qty": q, "rate": rate_of(c, "Standard Buying")} for c, q in pairs]
	if warehouse:
		for r in rows:
			r["warehouse"] = warehouse
	return rows


def seed_selling():
	# Quotation waiting to be ordered (the "Turn a quotation into a sales order" tour).
	insert_tx(
		{
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": frappe.db.get_value("Customer", {"customer_name": "Deccan Retail Co."}),
			"company": COMPANY,
			"transaction_date": back(14),
			"valid_till": add_days(today(), 20),
			"order_type": "Sales",
			"items": sell_items(("SHIRT-CTN-M", 240), ("KURTA-LIN-L", 80)),
		}
	)
	# Sales order waiting to be delivered (the "Deliver the order" tour).
	insert_tx(
		{
			"doctype": "Sales Order",
			"customer": frappe.db.get_value("Customer", {"customer_name": "Sharma Garments"}),
			"company": COMPANY,
			"transaction_date": back(8),
			"delivery_date": add_days(today(), 5),
			"set_warehouse": wh("Stores"),
			"items": [
				{**r, "delivery_date": add_days(today(), 5), "warehouse": wh("Stores")}
				for r in sell_items(("COT-FAB-60", 900), ("BTN-PACK-100", 30))
			],
		}
	)
	# Unpaid invoices (the "Record a customer payment" tour picks Kaveri Textiles).
	for customer, days, items in (
		("Patel Fashion House", 30, (("DNM-FAB-12", 600),)),
		("Kaveri Textiles", 12, (("SHIRT-CTN-M", 180),)),
	):
		insert_tx(
			{
				"doctype": "Sales Invoice",
				"customer": frappe.db.get_value("Customer", {"customer_name": customer}),
				"company": COMPANY,
				"set_posting_time": 1,
				"posting_date": back(days),
				"due_date": add_days(back(days), 30),
				"items": sell_items(*items),
			}
		)


def seed_buying():
	coimbatore = frappe.db.get_value("Supplier", {"supplier_name": "Coimbatore Cotton Co."})
	shree = frappe.db.get_value("Supplier", {"supplier_name": "Shree Dyes & Chemicals"})
	# Purchase order not yet received (the "Receive goods against the order" tour).
	insert_tx(
		{
			"doctype": "Purchase Order",
			"supplier": coimbatore,
			"company": COMPANY,
			"transaction_date": back(6),
			"schedule_date": add_days(today(), 4),
			"set_warehouse": wh("Stores"),
			"items": [
				{**r, "schedule_date": add_days(today(), 4)}
				for r in buy_items(("COT-FAB-60", 1500), warehouse=wh("Stores"))
			],
		}
	)
	# Purchase receipt not yet billed (the "Book the supplier's bill" tour).
	insert_tx(
		{
			"doctype": "Purchase Receipt",
			"supplier": shree,
			"company": COMPANY,
			"set_posting_time": 1,
			"posting_date": back(3),
			"set_warehouse": wh("Stores"),
			"supplier_delivery_note": "SDC/DC/2290",
			"items": buy_items(("DYE-RED-25", 30), warehouse=wh("Stores")),
		}
	)


def make_bom(item, rows):
	return insert_tx(
		{
			"doctype": "BOM",
			"item": item,
			"quantity": 1,
			"company": COMPANY,
			"is_active": 1,
			"is_default": 1,
			"currency": "INR",
			"conversion_rate": 1,
			"rm_cost_as_per": "Valuation Rate",
			"items": [{"item_code": c, "qty": q, "uom": uom_of(c), "rate": rate_of(c, "Standard Buying")} for c, q in rows],
		}
	)


def seed_manufacturing():
	make_bom("SHIRT-CTN-M", (("COT-FAB-60", 1.6), ("BTN-PACK-100", 0.08)))
	kurta = make_bom("KURTA-LIN-L", (("COT-FAB-60", 2.4), ("DYE-RED-25", 0.05)))
	# Work order ready to finish (the "Finish production" tour). Materials are taken
	# straight from Stores, so no separate transfer step is needed.
	insert_tx(
		{
			"doctype": "Work Order",
			"production_item": "KURTA-LIN-L",
			"bom_no": kurta.name,
			"qty": 40,
			"company": COMPANY,
			"planned_start_date": f"{back(2)} 09:00:00",
			"skip_transfer": 1,
			"source_warehouse": wh("Stores"),
			"fg_warehouse": wh("Finished Goods"),
		}
	)


def seed_assets():
	employee = frappe.db.get_value("Employee", {"employee_name": "Vikram Mehta"})
	insert_tx(
		{
			"doctype": "Asset",
			"asset_name": "CNC Lathe Machine - Line 1",
			"item_code": "CNC Lathe Machine",
			"asset_category": "Plant and Machinery",
			"asset_type": "Existing Asset",
			"company": COMPANY,
			"location": "Factory",
			"custodian": employee,
			"purchase_date": back(150),
			"available_for_use_date": back(140),
			"net_purchase_amount": 1450000,
			"calculate_depreciation": 0,
		}
	)


SEEDERS = {
	"masters": seed_masters,
	"stock": seed_stock,
	"selling": seed_selling,
	"buying": seed_buying,
	"manufacturing": seed_manufacturing,
	"assets": seed_assets,
}


# ---------------------------------------------------------------- API


def _require_manager():
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist(methods=["GET", "POST"])
def status():
	"""Where this site stands: setup finished, company created, and which seed stages ran."""
	_require_manager()
	return {
		"setup_complete": bool(frappe.is_setup_complete()),
		"erpnext": "erpnext" in frappe.get_installed_apps(),
		"company": bool(frappe.db.exists("Company", COMPANY)),
		"stages": STAGES,
		"done": [s for s in STAGES if done(s)],
	}


@frappe.whitelist(methods=["POST"])
def seed(stage):
	"""Run one seed stage. Safe to call again: a finished stage is skipped."""
	_require_manager()
	if stage not in SEEDERS:
		frappe.throw(f"Unknown stage {stage}")
	if not frappe.db.exists("Company", COMPANY):
		frappe.throw(f"Company {COMPANY} is missing; run setup first")
	if done(stage):
		return {"stage": stage, "skipped": True}
	frappe.flags.mute_emails = True
	SEEDERS[stage]()
	mark_done(stage)
	frappe.db.commit()
	return {"stage": stage, "skipped": False}
