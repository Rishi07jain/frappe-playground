/* ERPNext Experience Center: guided-tour driver for the real desk.
   A tour is a list of steps built by experience/desk/tours.js. Each step plays by
   itself (cursor moves, fields fill, buttons are pressed) through Frappe's own APIs,
   then waits for Next. Back re-plays the previous step when it was a field, row or
   highlight on the same unsaved form; after a save or a page change it is off,
   because a real document can't be un-saved. */
(function () {
  'use strict';
  var EC = window.ECDesk;
  if (!EC || EC.startTour) return;
  var O = EC.overlay;
  var run = null;

  /* ---------------------------------------------------------------- lookups for tours */

  EC.h = {
    /* Name of the newest document matching filters, or null. */
    latest: function (doctype, filters) {
      return frappe.db.get_list(doctype, { filters: filters || {}, fields: ['name'], order_by: 'creation desc', limit: 1 })
        .then(function (r) { return r && r[0] ? r[0].name : null; });
    },
    value: function (doctype, filters, field) {
      return frappe.db.get_value(doctype, filters, field).then(function (r) { return r && r.message ? r.message[field] : null; });
    },
    exists: function (doctype, name) {
      return frappe.db.exists(doctype, name);
    },
    today: function () { return frappe.datetime.get_today(); },
    addDays: function (d, n) { return frappe.datetime.add_days(d, n); },
    monthEnd: function () { return frappe.datetime.month_end(); },
  };

  /* ---------------------------------------------------------------- desk helpers */

  function frm() { return window.cur_frm || null; }

  function onForm(doctype) {
    var r = EC.route(), f = frm();
    return r[0] === 'Form' && r[1] === doctype && f && f.doctype === doctype && f.doc && f.$wrapper && EC.visible(f.$wrapper[0]);
  }

  function sidebarHaving(doctype, prefer) {
    var all = (frappe.boot && frappe.boot.module_sidebars) || {};
    function has(key) {
      var sb = all[key];
      return sb && (sb.items || []).some(function (it) { return it.link_type === 'DocType' && it.link_to === doctype; });
    }
    if (prefer && has(prefer)) return prefer;
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) if (has(keys[i])) return keys[i];
    return null;
  }

  function sidebarAnchor(label) {
    var list = document.querySelectorAll('.body-sidebar a.item-anchor');
    for (var i = 0; i < list.length; i++) {
      var l = list[i].querySelector('.sidebar-item-label');
      if (l && l.textContent.trim() === label) return list[i];
    }
    return null;
  }

  function openShell(name) {
    var sb = frappe.app && frappe.app.sidebar;
    if (sb && sb.open_module && frappe.boot.module_sidebars && frappe.boot.module_sidebars[name]) sb.open_module(name);
    else frappe.set_route('/desk/' + frappe.router.slug(name));
  }

  function selectShell(name) {
    var sb = frappe.app && frappe.app.sidebar;
    if (sb && sb.select_shell) sb.select_shell(name);
  }

  function visibleIn(selector, root) {
    var list = (root || document).querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) if (EC.visible(list[i])) return list[i];
    return null;
  }

  function primaryButton() {
    return visibleIn('.page-head .page-actions .primary-action') || visibleIn('.page-actions .primary-action');
  }

  function visibleDialog() {
    var d = window.cur_dialog;
    if (d && d.$wrapper && (d.display || d.$wrapper.hasClass('show')) && d !== frappe.msg_dialog) return d;
    return null;
  }

  /* A dialog's primary button: Frappe's own lookup first, then the older markup. */
  function dialogPrimary(d) {
    var list = [];
    try { if (d.get_primary_btn) list = list.concat(d.get_primary_btn().toArray()); } catch (e) {}
    list = list.concat(d.$wrapper.find('.btn-modal-primary, .modal-footer .btn-primary').toArray());
    for (var i = 0; i < list.length; i++) if (EC.visible(list[i]) && !list[i].disabled) return list[i];
    return null;
  }

  /* The text of an open Frappe error message, which is then closed. */
  function takeError() {
    var md = frappe.msg_dialog;
    if (md && md.$wrapper && md.$wrapper.hasClass('show')) {
      var t = md.$wrapper.find('.msgprint').text().trim() || md.$wrapper.find('.modal-body').text().trim();
      try { md.hide(); } catch (e) {}
      return t;
    }
    return '';
  }

  function check(cond, message) {
    if (!cond) throw new Error(takeError() || message);
  }

  /* ---------------------------------------------------------------- step actions */

  var TYPED = ['Data', 'Small Text', 'Text', 'Int', 'Float', 'Currency'];

  function setField(f, field, value, animate) {
    var df = f.fields_dict[field] && f.fields_dict[field].df;
    var ctrl = f.fields_dict[field];
    if (animate && df && TYPED.indexOf(df.fieldtype) >= 0 && ctrl.$input && ctrl.$input[0]) {
      var input = ctrl.$input[0], text = String(value), i = 0;
      input.value = '';
      return new Promise(function (resolve) {
        (function tick() {
          if (i >= text.length || EC.reduced) return resolve();
          input.value += text[i++];
          setTimeout(tick, 28);
        })();
      }).then(function () { return f.set_value(field, value); });
    }
    return Promise.resolve(f.set_value(field, value));
  }

  var ACT = {
    start: function (step) {
      openShell(run.meta.sidebar);
      return EC.waitFor(function () { return visibleIn('.body-sidebar'); }, 15000).then(EC.waitIdle).then(function () {
        return EC.sleep(EC.pace(300));
      }).then(function () { return visibleIn('.body-sidebar'); });
    },

    side: function (step) {
      var dt = step.doctype, label = step.label || dt;
      var a = sidebarAnchor(label);
      var p = Promise.resolve();
      if (!a || !EC.visible(a)) {
        var shell = sidebarHaving(dt, run.meta.sidebar);
        if (shell) { selectShell(shell); p = EC.waitFor(function () { return sidebarAnchor(label); }, 4000).catch(function () {}); }
      }
      return p.then(function () {
        a = sidebarAnchor(label);
        if (a && !EC.visible(a)) {
          // A collapsed section: open it first.
          var section = a.closest('.section-item');
          var head = section && section.querySelector('.section-break');
          if (head) head.click();
        }
        a = sidebarAnchor(label);
        if (!a || !EC.visible(a)) { frappe.set_route('List', dt); return null; }
        return EC.reveal(a).then(function () { return O.moveTo(a); }).then(function () { return O.click(); }).then(function () {
          a.click();
          return a;
        });
      }).then(function (a) {
        return EC.waitFor(function () { var r = EC.route(); return r[0] === 'List' && r[1] === dt; }, 15000)
          .then(EC.waitIdle).then(function () { return a || visibleIn('.layout-main-section'); });
      });
    },

    new: function (step) {
      var btn = primaryButton();
      var go = btn ? O.moveTo(btn).then(function () { return O.click(); }).then(function () { btn.click(); })
        : Promise.resolve(frappe.new_doc(step.doctype));
      return go.then(function () {
        return EC.waitFor(function () { return onForm(step.doctype) && frm().doc.__islocal; }, 15000);
      }).then(EC.waitIdle).then(function () { return EC.sleep(EC.pace(300)); }).then(function () {
        return visibleIn('.form-layout') || visibleIn('.page-head');
      });
    },

    open: function (step) {
      var name = step.name;
      var link = document.querySelector('.list-row-container a[data-name="' + CSS.escape(name) + '"]');
      var go = link && EC.visible(link)
        ? EC.reveal(link).then(function () { return O.moveTo(link); }).then(function () { return O.click(); }).then(function () { link.click(); })
        : Promise.resolve(frappe.set_route('Form', step.doctype, name));
      return go.then(function () {
        return EC.waitFor(function () { return onForm(step.doctype) && frm().docname === name; }, 15000);
      }).then(EC.waitIdle).then(function () { return visibleIn('.page-head'); });
    },

    field: function (step) {
      var f = frm();
      check(f && f.fields_dict[step.field], 'The ' + step.field + ' field is not on this form');
      try { f.scroll_to_field(step.field, false); } catch (e) {}
      var ctrl = f.fields_dict[step.field];
      var target = ctrl.$wrapper[0];
      return EC.sleep(EC.pace(250)).then(function () { return EC.reveal(target); })
        .then(function () { return O.moveTo(ctrl.$input ? ctrl.$input[0] : target); })
        .then(function () { return O.click(); })
        .then(function () { return setField(f, step.field, step.value, true); })
        .then(EC.waitIdle)
        .then(function () {
          var extra = step.also || {};
          return Object.keys(extra).reduce(function (p, k) {
            return p.then(function () { return f.fields_dict[k] ? f.set_value(k, extra[k]) : null; }).then(EC.waitIdle);
          }, Promise.resolve());
        })
        .then(function () { return target; });
    },

    row: function (step) {
      var f = frm(), table = step.table || 'items';
      check(f && f.fields_dict[table], 'The ' + table + ' table is not on this form');
      try { f.scroll_to_field(table, false); } catch (e) {}
      var rows = f.doc[table] || [];
      var first = step.firstKey || 'item_code';
      var row = rows[step.index];
      if (!row || (row[first] && step.fresh)) {
        // Reuse an empty row the form already has, or add one.
        row = rows.filter(function (r) { return !r[first]; })[0] || f.add_child(table);
        f.refresh_field(table);
      }
      var grid = f.fields_dict[table].grid;
      var el = function () {
        var gr = grid.grid_rows_by_docname && grid.grid_rows_by_docname[row.name];
        return gr && gr.row ? gr.row[0] : f.fields_dict[table].$wrapper[0];
      };
      var values = step.values || {};
      return EC.sleep(EC.pace(200)).then(function () { return EC.reveal(el()); })
        .then(function () { return O.moveTo(el()); }).then(function () { return O.click(); })
        .then(function () {
          return Object.keys(values).reduce(function (p, k) {
            return p.then(function () { return frappe.model.set_value(row.doctype, row.name, k, values[k]); })
              .then(EC.waitIdle).then(function () { return EC.sleep(EC.pace(220)); });
          }, Promise.resolve());
        })
        .then(function () { f.refresh_field(table); return el(); });
    },

    look: function (step) {
      var t = typeof step.target === 'function' ? step.target(frm()) : visibleIn(step.target);
      t = EC.$el(t);
      return EC.reveal(t).then(function () { return t ? O.moveTo(t) : null; }).then(function () { return t; });
    },

    save: function () {
      var f = frm();
      var btn = f.page.btn_primary && f.page.btn_primary[0];
      return O.moveTo(btn).then(function () { return O.click(); }).then(function () {
        var saved = function () { return !f.doc.__islocal && !f.is_dirty(); };
        return Promise.race([
          Promise.resolve(f.save()).catch(function () {}),
          EC.waitFor(function () { return saved() || takeErrorPeek(); }, 30000).catch(function () {}),
        ]).then(EC.waitIdle).then(function () {
          check(saved(), 'Saving didn’t go through');
          return EC.sleep(EC.pace(300));
        });
      }).then(function () { return visibleIn('.page-head .indicator-pill') || btn; });
    },

    submit: function () {
      var f = frm();
      var btn = f.page.btn_primary && f.page.btn_primary[0];
      return O.moveTo(btn).then(function () { return O.click(); }).then(function () {
        f.savesubmit();
        return EC.waitFor(function () {
          var d = visibleDialog();
          return (d && dialogPrimary(d)) || takeErrorPeek();
        }, 10000);
      }).then(function (yes) {
        check(yes && yes.nodeType === 1, 'Submitting didn’t go through');
        return O.moveTo(yes).then(function () { return O.click(); }).then(function () { yes.click(); });
      }).then(function () {
        return EC.waitFor(function () { return f.doc.docstatus === 1 || takeErrorPeek(); }, 40000).catch(function () {});
      }).then(EC.waitIdle).then(function () {
        check(f.doc.docstatus === 1, 'Submitting didn’t go through');
        return EC.sleep(EC.pace(400));
      }).then(function () { return visibleIn('.page-head .indicator-pill') || btn; });
    },

    create: function (step) {
      var f = frm(), $tb = f.page.inner_toolbar, label = step.label;
      var trigger, storeItem;
      if (step.group) {
        var $g = $tb.find('.inner-group-button[data-label="' + encodeURIComponent(step.group) + '"]');
        trigger = $g.children('button')[0] || $g.find('button')[0];
        storeItem = $g.find('.dropdown-menu a[data-label="' + encodeURIComponent(label) + '"]')[0];
      } else {
        trigger = $tb.find('button[data-label="' + encodeURIComponent(label) + '"]')[0];
      }
      var p;
      if (step.group && trigger && storeItem) {
        p = O.moveTo(trigger).then(function () { return O.click(); }).then(function () {
          trigger.click();
          return EC.sleep(EC.pace(450));
        }).then(function () {
          var item = menuItem(label);
          if (item) return O.moveTo(item).then(function () { return O.click(); }).then(function () { item.click(); });
          closeMenus();
          $(storeItem).trigger('click');
        });
      } else if (!step.group && trigger) {
        p = O.moveTo(trigger).then(function () { return O.click(); }).then(function () { trigger.click(); });
      } else if (step.fallback) {
        p = Promise.resolve(step.fallback(f));
      } else {
        throw new Error('“' + label + '” isn’t available on this document');
      }
      return p.then(function () {
        return EC.waitFor(function () { return onForm(step.doctype) && frm() !== f ? 'form' : (visibleDialog() ? 'dialog' : null); }, 20000);
      }).then(function (what) {
        if (what !== 'dialog') return null;
        var d = visibleDialog(), vals = step.dialog || {};
        return Object.keys(vals).reduce(function (q, k) {
          return q.then(function () { return d.fields_dict[k] ? d.set_value(k, vals[k]) : null; });
        }, Promise.resolve()).then(function () { return EC.sleep(EC.pace(350)); }).then(function () {
          var ok = dialogPrimary(d);
          check(ok, 'The dialog had no button to continue');
          return O.moveTo(ok).then(function () { return O.click(); }).then(function () { ok.click(); });
        }).then(function () {
          return EC.waitFor(function () { return onForm(step.doctype) || takeErrorPeek(); }, 20000);
        });
      }).then(EC.waitIdle).then(function () {
        check(onForm(step.doctype), 'The ' + step.doctype + ' didn’t open');
        return EC.sleep(EC.pace(350));
      }).then(function () { return visibleIn('.form-layout') || visibleIn('.page-head'); });
    },

    print: function () {
      var f = frm();
      var btn = visibleIn('.page-head [data-label="Print"], .page-head .btn-print, .page-head button[title="Print"]');
      return (btn ? O.moveTo(btn).then(function () { return O.click(); }) : Promise.resolve()).then(function () {
        f.print_doc();
        return EC.waitFor(function () { return EC.route()[0] === 'print'; }, 15000);
      }).then(EC.waitIdle).then(function () { return EC.sleep(EC.pace(800)); }).then(function () {
        return visibleIn('.print-preview-wrapper') || visibleIn('.print-format') || visibleIn('.layout-main-section');
      });
    },

    email: function () {
      var f = frm();
      return Promise.resolve(f.email_doc()).then(function () {
        return EC.waitFor(function () { return visibleDialog(); }, 10000);
      }).then(EC.waitIdle).then(function () {
        var d = visibleDialog();
        return d ? d.$wrapper.find('.modal-dialog')[0] : null;
      });
    },
  };

  function takeErrorPeek() {
    var md = frappe.msg_dialog;
    return md && md.$wrapper && md.$wrapper.hasClass('show') && md.$wrapper.find('.msgprint').text().trim() ? 'error' : null;
  }

  function menuItem(label) {
    var list = document.querySelectorAll('[role="menuitem"], .dropdown-menu.show a, .dropdown-menu.show .dropdown-item');
    for (var i = 0; i < list.length; i++) {
      if (EC.visible(list[i]) && list[i].textContent.trim() === label) return list[i];
    }
    return null;
  }

  function closeMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.click();
  }

  /* ---------------------------------------------------------------- the step card */

  var WATCH = 'You just watch: each step plays out on screen, then <b>Next</b> unlocks.';

  function card(step, index, total, state) {
    var tip = O.tip;
    var text = step.html ? step.text : EC.esc(step.text);
    if (step.kind === 'start') text += ' <span class="ec-watch">' + WATCH + '</span>';
    var err = state && state.error;
    tip.innerHTML =
      '<div class="ec-tip-head"><span class="ec-tip-count">' + (index + 1) + ' of ' + total + '</span>' +
      '<button type="button" class="ec-tip-x" data-ec="close" aria-label="Close tour">&times;</button></div>' +
      '<div class="ec-tip-title">' + EC.esc(step.title) + '</div>' +
      '<div class="ec-tip-text">' + text + '</div>' +
      (err ? '<div class="ec-tip-error">This step didn’t go through: ' + EC.esc(err) + '</div>' : '') +
      '<div class="ec-tip-foot">' +
      (err
        ? '<button type="button" class="btn btn-default btn-xs" data-ec="skip">Skip step</button>' +
          '<button type="button" class="btn btn-primary btn-xs" data-ec="retry">Try again</button>'
        : '<button type="button" class="btn btn-default btn-xs" data-ec="back"' + (canBack(index) ? '' : ' disabled') + '>Back</button>' +
          '<button type="button" class="btn btn-primary btn-xs" data-ec="next"' + (state && state.playing ? ' disabled' : '') + '>' +
          (state && state.playing ? 'Playing…' : 'Next') + '</button>') +
      '</div>';
    tip.hidden = false;
  }

  function canBack(i) {
    if (!run || i < 1) return false;
    var prev = run.steps[i - 1], cur = run.steps[i];
    var local = ['field', 'row', 'look'];
    return local.indexOf(prev.kind) >= 0 && local.indexOf(cur.kind) >= 0 && prev._form && prev._form === cur._form &&
      frm() && frm().doc.__islocal;
  }

  function formKey() {
    var f = frm();
    return f && EC.route()[0] === 'Form' ? f.doctype + '/' + f.docname : '';
  }

  function follow() {
    if (!run || !run.target) return;
    if (run.spot) O.spotlight(run.target);
    O.place(run.target);
  }

  function play(i) {
    var step = run.steps[i];
    run.i = i;
    run.target = null;
    run.spot = false;
    O.spotlight(null);
    if (step.kind === 'done') return finish(step);
    card(step, i, run.steps.length - 1, { playing: true });
    O.place(null);
    var token = (run.token = {});
    var act = ACT[step.kind];
    Promise.resolve().then(function () { return act ? act(step) : null; }).then(function (target) {
      if (!run || run.token !== token) return;
      step._form = formKey();
      if (step._form) run.doc = frm().doc;
      run.target = EC.$el(target);
      run.spot = !!run.target;
      card(step, i, run.steps.length - 1);
      follow();
    }).catch(function (e) {
      if (!run || run.token !== token) return;
      console.warn('[Experience] tour step failed', step, e);
      card(step, i, run.steps.length - 1, { error: (e && e.message) || 'unknown error' });
      O.place(null);
    });
  }

  function onTipClick(e) {
    var b = e.target.closest('[data-ec]');
    if (!b || !run) return;
    var what = b.getAttribute('data-ec');
    var step = run.steps[run.i];
    if (what === 'close') return EC.endTour(false);
    if (what === 'retry') return play(run.i);
    if (what === 'skip' || what === 'next') {
      if (step.onLeave) try { step.onLeave(); } catch (err) {}
      return play(run.i + 1);
    }
    if (what === 'back' && canBack(run.i)) return play(run.i - 1);
  }

  /* ---------------------------------------------------------------- end screen */

  function finish(step) {
    var f = frm();
    var doc = run.doc || (f ? f.doc : {});
    var msg = '';
    try { msg = typeof step.text === 'function' ? step.text(doc) : step.text; } catch (e) { msg = ''; }
    O.spotlight(null);
    O.cursor.hidden = true;
    var tip = O.tip;
    tip.innerHTML =
      '<div class="ec-done">' +
      '<div class="ec-tip-title">Done. ' + EC.esc(run.meta.title) + '.</div>' +
      '<div class="ec-tip-text">' + EC.esc(msg) + '</div>' +
      '<div class="ec-rate"><div class="ec-rate-q">How useful was this tour?</div><div class="ec-rate-row">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="ec-rate-n" data-rate="' + n + '" aria-pressed="false">' + n + '</button>'; }).join('') +
      '</div><textarea class="form-control ec-rate-c" rows="2" placeholder="Anything we should know? (optional)"></textarea>' +
      '<button type="button" class="btn btn-default btn-xs ec-rate-send" data-ec="send" disabled>Send feedback</button>' +
      '<span class="ec-rate-thanks" hidden>Thanks, that helps.</span></div>' +
      '<div class="ec-tip-foot">' +
      '<a class="btn btn-primary btn-xs" target="_blank" rel="noopener" href="' + EC.esc(EC.config.trialUrl || '#') + '">Start free trial</a>' +
      '<button type="button" class="btn btn-default btn-xs" data-ec="dash">Back to Dashboard</button>' +
      '<button type="button" class="btn btn-default btn-xs" data-ec="end">Close</button>' +
      '</div></div>';
    tip.hidden = false;
    O.place(null);
    EC.markDone(run.id);
    var rating = 0;
    tip.onclick = function (e) {
      var r = e.target.closest('[data-rate]');
      if (r) {
        rating = +r.getAttribute('data-rate');
        tip.querySelectorAll('[data-rate]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(+x.getAttribute('data-rate') === rating));
        });
        tip.querySelector('[data-ec="send"]').disabled = false;
        return;
      }
      var b = e.target.closest('[data-ec]');
      if (!b) return;
      var what = b.getAttribute('data-ec');
      if (what === 'send') {
        EC.post({ type: 'feedback', payload: { kind: 'tour', tour: run.id, rating: rating, comment: tip.querySelector('.ec-rate-c').value.trim() } });
        b.hidden = true;
        tip.querySelector('.ec-rate-thanks').hidden = false;
      } else if (what === 'dash') {
        var shell = run.meta.sidebar;
        EC.endTour(true, true);
        openDashboard(shell);
      } else if (what === 'end') {
        EC.endTour(true);
      }
    };
  }

  function openDashboard(shell) {
    selectShell(shell);
    var sb = frappe.boot.module_sidebars && frappe.boot.module_sidebars[shell];
    var item = sb && (sb.items || []).filter(function (it) { return it.link_type === 'Dashboard'; })[0];
    var route = item && frappe.ui.sidebar_item && frappe.ui.sidebar_item.get_route(item, false, shell);
    if (route) frappe.set_route(route);
    else openShell(shell);
  }

  /* ---------------------------------------------------------------- public API */

  var DONE_KEY = 'ec_tours_done';
  EC.doneTours = function () {
    try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch (e) { return []; }
  };
  EC.markDone = function (id) {
    var list = EC.doneTours();
    if (list.indexOf(id) < 0) list.push(id);
    try { localStorage.setItem(DONE_KEY, JSON.stringify(list)); } catch (e) {}
    EC.post({ type: 'tours-done', done: list });
  };

  EC.isTouring = function () { return !!run; };

  EC.startTour = function (id) {
    if (run) return false;
    var meta = (EC.config.catalog || []).filter(function (t) { return t.id === id; })[0];
    var def = EC.tours[id];
    if (!meta || !def) return false;
    var mod = (EC.config.modules || []).filter(function (m) { return m.key === meta.module; })[0] || {};
    meta = Object.assign({ sidebar: mod.sidebar || mod.label }, meta);
    EC.touring = true;
    EC.hideGuard();
    try { if (visibleDialog()) visibleDialog().hide(); } catch (e) {}
    run = { id: id, meta: meta, steps: [], i: 0 };
    EC.post({ type: 'tour', running: true, id: id });
    O.show();
    O.tip.onclick = onTipClick;
    O.tip.innerHTML = '<div class="ec-tip-title">' + EC.esc(meta.title) + '</div><div class="ec-tip-text">Getting the sample data ready…</div>';
    O.tip.hidden = false;
    O.place(null);
    Promise.resolve(def.build(EC.h)).then(function (steps) {
      if (!run) return;
      if (!steps || !steps.length) throw new Error('missing');
      if (steps.missing) {
        O.tip.innerHTML = '<div class="ec-tip-title">' + EC.esc(meta.title) + '</div><div class="ec-tip-text">' + EC.esc(steps.missing) + '</div>' +
          '<div class="ec-tip-foot"><button type="button" class="btn btn-primary btn-xs" data-ec="close">Close</button></div>';
        return;
      }
      run.steps = steps;
      O.tip.onclick = onTipClick;
      play(0);
    }).catch(function (e) {
      console.warn('[Experience] tour could not start', e);
      if (!run) return;
      O.tip.innerHTML = '<div class="ec-tip-title">' + EC.esc(meta.title) + '</div><div class="ec-tip-text">This tour couldn’t start. Reset the Experience Center and try again.</div>' +
        '<div class="ec-tip-foot"><button type="button" class="btn btn-primary btn-xs" data-ec="close">Close</button></div>';
    });
    return true;
  };

  EC.endTour = function (completed, keepRoute) {
    if (!run) return;
    var id = run.id, step = run.steps[run.i];
    if (step && step.onLeave) try { step.onLeave(); } catch (e) {}
    run = null;
    O.tip.onclick = null;
    O.hide();
    try { if (visibleDialog()) visibleDialog().hide(); } catch (e) {}
    // Leaving a form open would bring up the edit guard straight away; go to its list.
    var r = EC.route();
    if (!keepRoute && (r[0] === 'Form' || r[0] === 'print') && r[1]) frappe.set_route('List', r[1]);
    EC.touring = false;
    EC.post({ type: 'tour', running: false, id: id, completed: !!completed });
  };

  window.addEventListener('resize', follow);
  window.addEventListener('scroll', follow, true);
  document.addEventListener('keydown', function (e) {
    if (run && e.key === 'Escape') { e.stopPropagation(); EC.endTour(false); }
  }, true);
})();
