/* =========================================================
   Med X — ShadCN-style form field enhancements
   - Custom <select> (listbox popover, keyboard, brand-themed)
   - Custom date picker (calendar popover)
   - US phone number formatting: (XXX) XXX-XXXX
   Native controls are kept (sr-only) so values still submit
   and existing validation keeps working.
   ========================================================= */
(function () {
  'use strict';

  var MedX = {};

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  var CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
  var PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  /* ---------- Shared floating popover ---------- */
  var current = null;

  function closeCurrent() { if (current) current.close(); }
  MedX.close = closeCurrent;

  // Outside click closes the popover (capture so we can swallow the click
  // before it reaches things like the modal scrim).
  document.addEventListener('click', function (e) {
    if (!current) return;
    if (current.pop.contains(e.target) || current.anchor.contains(e.target)) return;
    var other = e.target.closest && e.target.closest('.mx-trigger');
    closeCurrent();
    if (!other) { e.stopPropagation(); }
  }, true);

  // Escape closes the popover only (don't let the modal also close).
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) {
      var a = current.anchor;
      closeCurrent();
      if (a && a.focus) a.focus();
      e.stopPropagation();
    }
  }, true);

  window.addEventListener('resize', function () { if (current) current.position(); });
  window.addEventListener('scroll', function () { if (current) current.position(); }, true);

  /* Some browsers don't re-resolve a var()-based background-color on the
     persistent .mx-trigger elements when the root theme class flips at
     runtime (the inherited token updates, but the computed background goes
     stale). Force a cheap, paint-free reflow on each theme change so the
     triggers always match the native inputs in light AND dark. */
  function repaintTriggers() {
    var nodes = document.querySelectorAll('.mx-trigger');
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i];
      var d = t.style.display;
      t.style.display = 'none';
      void t.offsetHeight;       // force reflow
      t.style.display = d;
    }
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(repaintTriggers).observe(document.documentElement, {
      attributes: true, attributeFilter: ['class']
    });
  }

  function openPopover(pop, anchor, onClose) {
    closeCurrent();
    pop.classList.add('mx-pop');
    document.body.appendChild(pop);

    function position() {
      var r = anchor.getBoundingClientRect();
      pop.style.minWidth = r.width + 'px';
      pop.style.left = Math.round(r.left) + 'px';
      var ph = pop.offsetHeight;
      var spaceBelow = window.innerHeight - r.bottom;
      var top;
      if (spaceBelow < ph + 14 && r.top > spaceBelow) top = Math.max(8, r.top - ph - 6);
      else top = r.bottom + 6;
      pop.style.top = Math.round(top) + 'px';
    }
    position();
    // Force a reflow so the initial (hidden) state is committed, then reveal.
    // Avoids relying on requestAnimationFrame, which is throttled in background tabs.
    void pop.offsetHeight;
    pop.classList.add('open');
    position();

    current = {
      pop: pop, anchor: anchor, position: position,
      close: function () {
        current = null;
        pop.classList.remove('open');
        anchor.setAttribute('aria-expanded', 'false');
        setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 150);
        if (onClose) onClose();
      }
    };
  }

  function isOpen(anchor) { return current && current.anchor === anchor; }

  /* ---------- Custom Select ---------- */
  function enhanceSelect(sel) {
    if (sel.__mx) return; sel.__mx = true;
    sel.classList.add('mx-native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');

    var labelEl = sel.closest('.field') ? sel.closest('.field').querySelector('label') : null;
    var trigger = el('div', 'mx-trigger mx-select-trigger');
    trigger.setAttribute('role', 'button');
    trigger.tabIndex = 0;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (labelEl && labelEl.textContent) trigger.setAttribute('aria-label', labelEl.textContent.trim());
    var valueEl = el('span', 'mx-trigger-value');
    trigger.appendChild(valueEl);
    trigger.appendChild(el('span', 'mx-trigger-icon mx-chev', CHEVRON));
    sel.parentNode.insertBefore(trigger, sel.nextSibling);

    function syncValue() {
      var o = sel.options[sel.selectedIndex];
      valueEl.textContent = o ? o.text : '';
    }
    syncValue();
    sel.addEventListener('change', syncValue);

    var built = null, activeIdx = -1;

    function setActive(i) {
      if (!built) return;
      i = Math.max(0, Math.min(sel.options.length - 1, i));
      if (activeIdx >= 0 && built[activeIdx]) built[activeIdx].classList.remove('active');
      activeIdx = i;
      if (built[i]) { built[i].classList.add('active'); built[i].scrollIntoView({ block: 'nearest' }); }
    }
    function choose(i) {
      if (i < 0) return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      var f = sel.closest('.field'); if (f) f.classList.remove('invalid');
      closeCurrent();
      trigger.focus();
    }
    function open() {
      var list = el('div', 'mx-listbox');
      list.setAttribute('role', 'listbox');
      built = [];
      for (var i = 0; i < sel.options.length; i++) {
        (function (i) {
          var o = sel.options[i];
          var item = el('div', 'mx-option');
          item.setAttribute('role', 'option');
          item.innerHTML = '<span class="mx-option-check">' + CHECK + '</span><span class="mx-option-label"></span>';
          item.querySelector('.mx-option-label').textContent = o.text;
          if (i === sel.selectedIndex) item.setAttribute('aria-selected', 'true');
          item.addEventListener('click', function () { choose(i); });
          item.addEventListener('mousemove', function () { if (activeIdx !== i) setActive(i); });
          list.appendChild(item);
          built.push(item);
        })(i);
      }
      var pop = el('div');
      pop.appendChild(list);
      trigger.setAttribute('aria-expanded', 'true');
      openPopover(pop, trigger, function () { built = null; activeIdx = -1; });
      setActive(sel.selectedIndex >= 0 ? sel.selectedIndex : 0);
    }

    trigger.addEventListener('click', function () { if (isOpen(trigger)) closeCurrent(); else open(); });
    trigger.addEventListener('keydown', function (e) {
      var open_ = isOpen(trigger);
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open_) open(); else setActive(activeIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open_) open(); else setActive(activeIdx - 1); }
      else if (e.key === 'Home') { if (open_) { e.preventDefault(); setActive(0); } }
      else if (e.key === 'End') { if (open_) { e.preventDefault(); setActive(sel.options.length - 1); } }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!open_) open(); else choose(activeIdx); }
    });
  }

  /* ---------- Date helpers ---------- */
  function parseISO(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function toISO(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function fmtLong(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  /* ---------- Custom Date Picker ---------- */
  function enhanceDate(inp) {
    if (inp.__mx) return; inp.__mx = true;
    inp.classList.add('mx-native');
    inp.setAttribute('tabindex', '-1');
    inp.setAttribute('aria-hidden', 'true');

    var placeholder = inp.getAttribute('data-placeholder') || 'Select a date';
    var minD = parseISO(inp.getAttribute('min'));
    var maxD = parseISO(inp.getAttribute('max'));
    var labelEl = inp.closest('.field') ? inp.closest('.field').querySelector('label') : null;

    var trigger = el('div', 'mx-trigger mx-date-trigger');
    trigger.setAttribute('role', 'button');
    trigger.tabIndex = 0;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    if (labelEl && labelEl.textContent) trigger.setAttribute('aria-label', labelEl.textContent.trim());
    var valueEl = el('span', 'mx-trigger-value');
    trigger.appendChild(valueEl);
    trigger.appendChild(el('span', 'mx-trigger-icon', CAL));
    inp.parentNode.insertBefore(trigger, inp.nextSibling);

    function syncValue() {
      var d = parseISO(inp.value);
      if (d) { valueEl.textContent = fmtLong(d); trigger.classList.remove('is-placeholder'); }
      else { valueEl.textContent = placeholder; trigger.classList.add('is-placeholder'); }
    }
    syncValue();
    inp.addEventListener('change', syncValue);

    function disabled(d) {
      d = startOfDay(d);
      if (minD && d < startOfDay(minD)) return true;
      if (maxD && d > startOfDay(maxD)) return true;
      return false;
    }
    function pick(d) {
      if (disabled(d)) return;
      inp.value = toISO(d);
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      var f = inp.closest('.field'); if (f) f.classList.remove('invalid');
      closeCurrent();
      trigger.focus();
    }

    function open() {
      var sel = parseISO(inp.value);
      var base = sel || minD || new Date();
      var viewMonth = new Date(base.getFullYear(), base.getMonth(), 1);

      var cal = el('div', 'mx-cal');
      var head = el('div', 'mx-cal-head');
      var prev = el('button', 'mx-cal-nav', PREV); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous month');
      var monthLabel = el('span', 'mx-cal-label');
      var next = el('button', 'mx-cal-nav', NEXT); next.type = 'button'; next.setAttribute('aria-label', 'Next month');
      head.appendChild(prev); head.appendChild(monthLabel); head.appendChild(next);
      cal.appendChild(head);

      var wd = el('div', 'mx-cal-wd');
      WEEKDAYS.forEach(function (w) { wd.appendChild(el('span', null, w)); });
      cal.appendChild(wd);

      var grid = el('div', 'mx-cal-grid');
      cal.appendChild(grid);

      var today = startOfDay(new Date());
      var selDate = parseISO(inp.value);

      function render() {
        monthLabel.textContent = MONTHS[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();
        grid.innerHTML = '';
        var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
        var start = new Date(first); start.setDate(1 - first.getDay());
        for (var i = 0; i < 42; i++) {
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          var cell = el('button', 'mx-day'); cell.type = 'button';
          cell.textContent = d.getDate();
          if (d.getMonth() !== viewMonth.getMonth()) cell.classList.add('mx-day-out');
          if (sameDay(d, today)) cell.classList.add('mx-day-today');
          if (selDate && sameDay(d, selDate)) cell.classList.add('mx-day-selected');
          if (disabled(d)) { cell.classList.add('mx-day-disabled'); cell.disabled = true; }
          (function (dd) { cell.addEventListener('click', function () { pick(dd); }); })(d);
          grid.appendChild(cell);
        }
        if (current) current.position();
      }
      prev.addEventListener('click', function () { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); });
      next.addEventListener('click', function () { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); render(); });
      render();

      var foot = el('div', 'mx-cal-foot');
      var clearBtn = el('button', 'mx-cal-link', 'Clear'); clearBtn.type = 'button';
      var todayBtn = el('button', 'mx-cal-link', 'Today'); todayBtn.type = 'button';
      clearBtn.addEventListener('click', function () {
        inp.value = '';
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        closeCurrent(); trigger.focus();
      });
      todayBtn.addEventListener('click', function () { pick(startOfDay(new Date())); });
      foot.appendChild(clearBtn); foot.appendChild(todayBtn);
      cal.appendChild(foot);

      var pop = el('div', 'mx-pop-cal');
      pop.appendChild(cal);
      trigger.setAttribute('aria-expanded', 'true');
      openPopover(pop, trigger);
    }

    trigger.addEventListener('click', function () { if (isOpen(trigger)) closeCurrent(); else open(); });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen(trigger)) open();
      }
    });
  }

  /* ---------- US phone formatting ---------- */
  function formatUSPhone(value) {
    var d = String(value).replace(/\D/g, '');
    if (d.length > 10 && d.charAt(0) === '1') d = d.slice(1); // drop leading country code
    d = d.slice(0, 10);
    if (d.length === 0) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function enhancePhone(inp) {
    if (inp.__mx) return; inp.__mx = true;
    inp.setAttribute('inputmode', 'tel');
    inp.setAttribute('autocomplete', 'tel');
    inp.setAttribute('maxlength', '14');
    function reformat() {
      var atEnd = inp.selectionStart === inp.value.length;
      var formatted = formatUSPhone(inp.value);
      if (formatted !== inp.value) {
        inp.value = formatted;
        if (atEnd) { try { inp.setSelectionRange(formatted.length, formatted.length); } catch (e) {} }
      }
    }
    inp.addEventListener('input', reformat);
    inp.addEventListener('blur', reformat);
    if (inp.value) reformat();
  }

  /* ---------- Public API ---------- */
  MedX.enhanceAll = function (root) {
    root = root || document;
    root.querySelectorAll('select.select').forEach(enhanceSelect);
    root.querySelectorAll('input[type="date"]').forEach(enhanceDate);
    root.querySelectorAll('input[data-validate="phone"], input[type="tel"]').forEach(enhancePhone);
  };

  window.MedXFields = MedX;

  if (document.readyState !== 'loading') MedX.enhanceAll(document);
  else document.addEventListener('DOMContentLoaded', function () { MedX.enhanceAll(document); });
})();
