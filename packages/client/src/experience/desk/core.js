/* ERPNext Experience Center: desk-side core.
   Injected into the real Frappe desk (the playground iframe) by the shell. It adds:
   - the edit guard: opening a form, quick entry, or any write call shows a
     "works in your free trial" card instead, except while a guided tour runs;
   - the overlay the tours use: a cursor, a spotlight and a step card;
   - theme sync and messages to the shell.
   Files load in order: core.js, tours.js, driver.js. Nothing here edits Frappe's
   source; it wraps a few public functions at runtime. */
(function () {
  'use strict';
  if (window.ECDesk) return;

  var EC = (window.ECDesk = {
    config: {},
    touring: false,
    tours: {},
    _guard: null,
  });

  /* ---------------------------------------------------------------- utils */

  EC.sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };
  EC.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  EC.pace = function (ms) { return EC.reduced ? Math.min(ms, 80) : ms; };

  EC.waitFor = function (test, timeout, interval) {
    timeout = timeout || 10000;
    interval = interval || 100;
    var t0 = Date.now();
    return new Promise(function (resolve, reject) {
      (function poll() {
        var v;
        try { v = test(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return reject(new Error('Timed out waiting'));
        setTimeout(poll, interval);
      })();
    });
  };

  /* Resolve once Frappe has no requests in flight and nothing is frozen. */
  EC.waitIdle = function (timeout) {
    var stableSince = 0;
    return EC.waitFor(function () {
      var busy = (window.frappe && frappe.request && frappe.request.ajax_count > 0) ||
        document.querySelector('.freeze:not(.hide), #freeze.in');
      if (busy) { stableSince = 0; return false; }
      if (!stableSince) stableSince = Date.now();
      return Date.now() - stableSince > 250;
    }, timeout || 20000, 60).catch(function () { return true; });
  };

  EC.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  EC.inr = function (n) {
    try { return format_currency(n, 'INR'); } catch (e) {
      return '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };
  EC.route = function () {
    try { return frappe.get_route() || []; } catch (e) { return []; }
  };
  EC.visible = function (el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  EC.$el = function (x) {
    if (!x) return null;
    if (x.jquery) return x[0] || null;
    return x;
  };
  EC.post = function (msg) {
    try {
      msg.source = 'ec-desk';
      window.parent.postMessage(msg, window.location.origin);
    } catch (e) { /* not embedded */ }
  };

  /* ---------------------------------------------------------------- overlay */

  var CURSOR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path d="M4 2.5l15 9.2-6.6 1.4 3.9 7.2-2.7 1.4-3.9-7.2L4.9 19z" fill="#171717" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  EC.overlay = {
    root: null,
    ensure: function () {
      if (this.root && document.body.contains(this.root)) return this.root;
      var root = document.createElement('div');
      root.className = 'ec-overlay';
      root.innerHTML =
        '<div class="ec-block"></div>' +
        '<div class="ec-spot" hidden></div>' +
        '<div class="ec-cursor" hidden>' + CURSOR_SVG + '<span class="ec-ripple"></span></div>' +
        '<div class="ec-tip" role="dialog" aria-live="polite" hidden></div>';
      document.body.appendChild(root);
      this.root = root;
      this.block = root.querySelector('.ec-block');
      this.spot = root.querySelector('.ec-spot');
      this.cursor = root.querySelector('.ec-cursor');
      this.tip = root.querySelector('.ec-tip');
      this.cx = window.innerWidth * 0.5;
      this.cy = window.innerHeight * 0.4;
      return root;
    },
    show: function () { this.ensure(); this.root.classList.add('is-on'); },
    hide: function () {
      if (!this.root) return;
      this.root.classList.remove('is-on');
      this.spot.hidden = true;
      this.cursor.hidden = true;
      this.tip.hidden = true;
    },
    /* Spotlight an element (or hide the spotlight for null). */
    spotlight: function (el, pad) {
      this.ensure();
      el = EC.$el(el);
      if (!el || !EC.visible(el)) { this.spot.hidden = true; return; }
      pad = pad == null ? 6 : pad;
      var r = el.getBoundingClientRect();
      var s = this.spot.style;
      s.left = (r.left - pad) + 'px';
      s.top = (r.top - pad) + 'px';
      s.width = (r.width + pad * 2) + 'px';
      s.height = (r.height + pad * 2) + 'px';
      this.spot.hidden = false;
    },
    /* Glide the cursor to an element's centre-left area. */
    moveTo: function (el) {
      this.ensure();
      el = EC.$el(el);
      if (!el || !EC.visible(el)) return Promise.resolve();
      var r = el.getBoundingClientRect();
      var x = r.left + Math.min(r.width * 0.5, 60);
      var y = r.top + Math.min(r.height * 0.6, 22);
      this.cursor.hidden = false;
      this.cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      this.cx = x; this.cy = y;
      return EC.sleep(EC.pace(650));
    },
    click: function () {
      var rp = this.cursor.querySelector('.ec-ripple');
      rp.classList.remove('go');
      void rp.offsetWidth;
      rp.classList.add('go');
      return EC.sleep(EC.pace(220));
    },
    /* Place the step card beside the target, or centred when there is none. */
    place: function (el) {
      var tip = this.tip;
      el = EC.$el(el);
      var w = tip.offsetWidth || 340, h = tip.offsetHeight || 180;
      var vw = window.innerWidth, vh = window.innerHeight, gap = 16, x, y;
      if (el && EC.visible(el)) {
        var r = el.getBoundingClientRect();
        if (r.right + gap + w < vw) { x = r.right + gap; y = r.top; }
        else if (r.left - gap - w > 0) { x = r.left - gap - w; y = r.top; }
        else if (r.bottom + gap + h < vh) { x = r.left; y = r.bottom + gap; }
        else { x = r.left; y = r.top - gap - h; }
      } else {
        x = (vw - w) / 2; y = Math.max(80, (vh - h) / 2.6);
      }
      x = Math.max(12, Math.min(x, vw - w - 12));
      y = Math.max(64, Math.min(y, vh - h - 12));
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    },
  };

  /* Bring an element into view, then wait for the scroll to settle. */
  EC.reveal = function (el) {
    el = EC.$el(el);
    if (!el) return Promise.resolve();
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: 'center', behavior: EC.reduced ? 'auto' : 'smooth' });
      return EC.sleep(EC.pace(450));
    }
    return Promise.resolve();
  };

  /* ---------------------------------------------------------------- guard */

  var WRITE_METHODS = [
    /^frappe\.client\.(save|insert|insert_many|submit|cancel|delete|set_value|bulk_update|rename_doc|attach_file)$/,
    /^frappe\.desk\.form\.save\./,
    /^frappe\.desk\.reportview\.(delete_items|delete_bulk|save_report)$/,
    /^frappe\.desk\.doctype\.bulk_update\./,
    /^frappe\.model\.rename_doc\./,
    /^frappe\.model\.workflow\./,
    /^frappe\.desk\.form\.utils\.(add_comment|update_comment|remove_attach)$/,
    /^frappe\.desk\.form\.assign_to\./,
    /^frappe\.desk\.doctype\.tag\.tag\.(add_tag|add_tags|remove_tag)$/,
    /^frappe\.desk\.like\.toggle_like$/,
    /^frappe\.core\.doctype\.data_import\./,
    /^frappe\.desk\.doctype\.workspace\.workspace\.(save_page|new_page|update_page|delete_page|duplicate_page)$/,
    /^frappe\.handler\.upload_file$/,
    /^frappe\.desk\.page\.setup_wizard\./,
  ];
  EC.isWrite = function (cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    for (var i = 0; i < WRITE_METHODS.length; i++) if (WRITE_METHODS[i].test(cmd)) return true;
    return false;
  };

  var GUARD_COPY = {
    form: 'This Experience Center is for looking around with sample data. Adding and editing records works in your own ERPNext.',
    write: 'Changes aren’t saved in the Experience Center. To add or change records, use your own ERPNext.',
  };

  EC.showGuard = function (reason) {
    if (EC.touring) return;
    var g = EC._guard;
    if (!g || !document.body.contains(g)) {
      g = document.createElement('div');
      g.className = 'ec-guard';
      g.setAttribute('role', 'dialog');
      g.setAttribute('aria-modal', 'true');
      g.setAttribute('aria-labelledby', 'ec-guard-title');
      g.innerHTML =
        '<div class="ec-guard-card">' +
        '<div class="ec-guard-title" id="ec-guard-title">This works in your free trial</div>' +
        '<p class="ec-guard-text"></p>' +
        '<div class="ec-guard-actions">' +
        '<button type="button" class="btn btn-default btn-sm" data-ec="back">Go back</button>' +
        '<a class="btn btn-primary btn-sm" data-ec="trial" target="_blank" rel="noopener">Start free trial</a>' +
        '</div></div>';
      g.querySelector('[data-ec="trial"]').setAttribute('href', EC.config.trialUrl || '#');
      g.querySelector('[data-ec="back"]').addEventListener('click', EC.guardBack);
      document.body.appendChild(g);
      EC._guard = g;
    }
    g.querySelector('.ec-guard-text').textContent = reason === 'write' ? GUARD_COPY.write : GUARD_COPY.form;
    g.dataset.reason = reason || 'form';
    g.classList.add('is-on');
    document.documentElement.classList.add('ec-guarded');
    setTimeout(function () {
      var b = g.querySelector('[data-ec="trial"]');
      b && b.focus();
    }, 30);
  };

  EC.hideGuard = function () {
    if (EC._guard) EC._guard.classList.remove('is-on');
    document.documentElement.classList.remove('ec-guarded');
  };

  EC.guardBack = function () {
    var r = EC.route();
    EC.hideGuard();
    if (r[0] === 'Form' && r[1]) {
      var meta = frappe.get_meta && frappe.get_meta(r[1]);
      if (meta && meta.issingle) frappe.set_route('');
      else frappe.set_route('List', r[1]);
    }
  };

  function checkRoute() {
    if (EC.touring) return EC.hideGuard();
    var r = EC.route();
    if (r[0] === 'Form') EC.showGuard('form');
    else if (EC._guard && EC._guard.dataset.reason === 'form') EC.hideGuard();
  }

  function blockKeys(e) {
    if (!document.documentElement.classList.contains('ec-guarded')) return;
    if (e.key === 'Escape') { e.preventDefault(); EC.guardBack(); return; }
    if (e.key === 'Tab') {
      var items = EC._guard ? EC._guard.querySelectorAll('button, a') : [];
      if (items.length) {
        var i = Array.prototype.indexOf.call(items, document.activeElement);
        var next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        items[next].focus();
        e.preventDefault();
      }
      e.stopPropagation();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) { e.preventDefault(); e.stopPropagation(); }
  }

  function installGuard() {
    // 1. Any write call is stopped at the one place every frappe.call passes through.
    var call = frappe.request.call;
    if (!call.__ec) {
      frappe.request.call = function (opts) {
        var cmd = (opts && opts.args && opts.args.cmd) || (opts && opts.method);
        if (!EC.touring && EC.isWrite(cmd)) {
          EC.showGuard(EC.route()[0] === 'Form' ? 'form' : 'write');
          try { if (opts.freeze) frappe.dom.unfreeze(); } catch (e) {}
          try { if (opts.btn) $(opts.btn).prop('disabled', false); } catch (e) {}
          try { opts.error && opts.error({}); } catch (e) {}
          try { opts.always && opts.always({}); } catch (e) {}
          var d = $.Deferred();
          d.reject({ status: 403, statusText: 'Experience Center' });
          return d.promise();
        }
        return call.apply(this, arguments);
      };
      frappe.request.call.__ec = true;
    }

    // 2. Quick entry dialogs: blocked for visitors; tours open the full form instead.
    var qe = frappe.ui.form.make_quick_entry;
    if (qe && !qe.__ec) {
      frappe.ui.form.make_quick_entry = function (doctype) {
        if (EC.touring) {
          frappe.set_route('Form', doctype, frappe.model.make_new_doc_and_get_name(doctype, true));
          return Promise.resolve();
        }
        EC.showGuard('quick');
        return Promise.resolve();
      };
      frappe.ui.form.make_quick_entry.__ec = true;
    }

    // 3. Opening any form (new, existing or a settings page).
    if (frappe.router && frappe.router.on) frappe.router.on('change', function () { setTimeout(checkRoute, 0); });
    setInterval(checkRoute, 700);
    document.addEventListener('keydown', blockKeys, true);
    checkRoute();
  }

  /* ---------------------------------------------------------------- theme */

  EC.setTheme = function (mode) {
    mode = mode === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme-mode', mode);
    if (frappe.ui && frappe.ui.set_theme) frappe.ui.set_theme(mode);
    else root.setAttribute('data-theme', mode);
  };

  /* ---------------------------------------------------------------- boot */

  function deskReady() {
    return window.frappe && frappe.boot && frappe.app && frappe.router && frappe.request &&
      frappe.ui && frappe.ui.form && frappe.session && frappe.session.user &&
      frappe.session.user !== 'Guest';
  }

  EC.init = function (config) {
    EC.config = config || {};
    EC.waitFor(deskReady, 120000, 200).then(function () {
      try { frappe.boot.show_new_navigation_prompt = false; } catch (e) {}
      if (EC.config.theme) EC.setTheme(EC.config.theme);
      installGuard();
      EC.post({ type: 'ready' });
    }).catch(function () { /* not a desk page (login, print, website) */ });
  };
})();
