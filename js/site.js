/* ============================================================
   Med X Scottsdale — shared site behavior
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     Backend endpoint for the inquiry forms.

     Points at the send-inquiry Supabase Edge Function, which stores
     the submission and emails the clinic. The anon key is safe in
     page source: RLS denies it every table, and the function is the
     only public surface.

     Until supabaseUrl is filled in the forms show an error telling
     the visitor to call, rather than a success message for a
     submission that went nowhere.
     ------------------------------------------------------------ */
  var CONFIG = window.MEDX_CONFIG || {
    supabaseUrl: 'https://axslnjxuparhjllpfbaj.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4c2xuanh1cGFyaGpsbHBmYmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNjQwNDMsImV4cCI6MjEwMjc0MDA0M30.JofjT-FHUYom31dqnZ8NxKXkUZuajvAVXVJNmDlz5Ho',
    functionName: 'send-inquiry'
  };

  var PHONE_FALLBACK = 'Something went wrong sending your request. Please call 480-219-0055.';
  var NOT_CONFIGURED = 'Online requests are not available just yet. Please call us at 480-219-0055.';

  /* ---- Theme (dark default, persisted) ---- */
  var root = document.documentElement;
  function applyTheme(t) {
    if (t === 'light') { root.classList.remove('dark'); root.classList.add('light'); }
    else { root.classList.add('dark'); root.classList.remove('light'); }
  }
  // theme is set pre-paint by inline script; just wire the toggle
  window.toggleTheme = function () {
    var isDark = root.classList.contains('dark');
    var next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('medx-theme', next); } catch (e) {}
  };

  document.addEventListener('DOMContentLoaded', function () {
    var tBtns = document.querySelectorAll('[data-theme-toggle]');
    tBtns.forEach(function (b) { b.addEventListener('click', window.toggleTheme); });

    /* ---- Mobile menu ---- */
    var menuBtn = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('.mobile-menu');
    if (menuBtn && menu) {
      var openIcon = menuBtn.querySelector('.icon-open');
      var closeIcon = menuBtn.querySelector('.icon-close');
      function setMenu(open) {
        menu.classList.toggle('open', open);
        document.body.style.overflow = open ? 'hidden' : '';
        if (openIcon && closeIcon) { openIcon.style.display = open ? 'none' : 'block'; closeIcon.style.display = open ? 'block' : 'none'; }
      }
      menuBtn.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });
      menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    }

    /* ---- Scroll reveal ---- */
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && reveals.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('in'); });
    }

    /* ---- Stat counters ---- */
    var counters = document.querySelectorAll('[data-count]');
    if (counters.length && 'IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target; cio.unobserve(el);
          var target = parseFloat(el.getAttribute('data-count'));
          var suffix = el.getAttribute('data-suffix') || '';
          var dur = 1400, start = performance.now();
          var dec = (target % 1 !== 0) ? 1 : 0;
          function tick(now) {
            var p = Math.min((now - start) / dur, 1);
            var e = 1 - Math.pow(1 - p, 3);
            el.textContent = (target * e).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.5 });
      counters.forEach(function (c) { cio.observe(c); });
    }

    /* ---- Nav shadow on scroll ---- */
    var nav = document.querySelector('.nav');
    if (nav) {
      var onScroll = function () { nav.style.boxShadow = window.scrollY > 8 ? 'var(--shadow-sm)' : 'none'; };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* ---- FAQ accordions ---- */
    document.querySelectorAll('[data-accordion] .acc-item').forEach(function (item) {
      var head = item.querySelector('.acc-head');
      if (!head) return;
      head.addEventListener('click', function () {
        var open = item.classList.contains('open');
        item.parentElement.querySelectorAll('.acc-item.open').forEach(function (o) { if (o !== item) o.classList.remove('open'); });
        item.classList.toggle('open', !open);
      });
    });

    /* ---- Appointment modal ---- */
    initAppointmentModal();
    initVideoLightbox();
  });

  /* ---- Appointment modal (injected once, shared across pages) ---- */
  /* ---- YouTube lightbox ----
     A facade: no YouTube iframe, script or cookie exists until the visitor
     actually clicks play, so the hero costs nothing on load. ---- */
  function initVideoLightbox() {
    var triggers = document.querySelectorAll('[data-video]');
    if (!triggers.length) return;

    var root = document.createElement('div');
    root.className = 'video-modal';
    root.innerHTML =
      '<div class="video-scrim" data-video-close></div>' +
      '<div class="video-frame" role="dialog" aria-modal="true" aria-label="Video">' +
        '<button class="video-close" type="button" data-video-close aria-label="Close video">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
        '</button>' +
        '<div class="video-slot"></div>' +
      '</div>';
    document.body.appendChild(root);

    var slot = root.querySelector('.video-slot');
    var opener = null;

    function open(id, trigger) {
      opener = trigger || null;
      // youtube-nocookie keeps tracking off until playback is chosen.
      slot.innerHTML =
        '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" ' +
        'title="Med X Scottsdale" allowfullscreen ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>';
      root.classList.add('open');
      document.body.style.overflow = 'hidden';
      var close = root.querySelector('.video-close');
      if (close) close.focus();
    }

    function close() {
      if (!root.classList.contains('open')) return;
      root.classList.remove('open');
      slot.innerHTML = '';                 // removing the iframe stops playback
      document.body.style.overflow = '';
      if (opener) opener.focus();
    }

    triggers.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        open(t.getAttribute('data-video'), t);
      });
    });
    root.querySelectorAll('[data-video-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  function initAppointmentModal() {
    var root = document.querySelector('.modal-root');
    if (!root) {
      var today = new Date().toISOString().split('T')[0];
      root = document.createElement('div');
      root.className = 'modal-root';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Request an appointment');
      root.innerHTML =
        '<div class="modal-scrim" data-modal-close></div>' +
        '<div class="modal-dialog">' +
          '<button class="modal-close" type="button" data-modal-close aria-label="Close">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
          '</button>' +
          '<div class="modal-head">' +
            '<span class="eyebrow">Request an appointment</span>' +
            '<h2 class="h2">Let\'s find a time that works</h2>' +
            '<p class="lead">Tell us a little about what you need. A member of our team will confirm your appointment within one business day — always confidentially.</p>' +
          '</div>' +
          '<form class="modal-form" id="modalApptForm" novalidate>' +
            '<div class="form-row">' +
              '<div class="field" data-validate><label for="m_fname">First name <span class="req">*</span></label><input class="input" id="m_fname" name="fname" type="text" data-validate="text" required placeholder="Jane" /><span class="err">Please enter your first name.</span></div>' +
              '<div class="field" data-validate><label for="m_lname">Last name <span class="req">*</span></label><input class="input" id="m_lname" name="lname" type="text" data-validate="text" required placeholder="Doe" /><span class="err">Please enter your last name.</span></div>' +
            '</div>' +
            '<div class="form-row">' +
              '<div class="field" data-validate><label for="m_email">Email <span class="req">*</span></label><input class="input" id="m_email" name="email" type="email" data-validate="email" required placeholder="jane@email.com" /><span class="err">Please enter a valid email.</span></div>' +
              '<div class="field" data-validate><label for="m_phone">Phone <span class="req">*</span></label><input class="input" id="m_phone" name="phone" type="tel" data-validate="phone" required placeholder="(480) 555-0123" /><span class="err">Please enter a valid phone number.</span></div>' +
            '</div>' +
            '<div class="form-row">' +
              '<div class="field"><label for="m_date">Preferred date</label><input class="input" id="m_date" name="date" type="date" min="' + today + '" /></div>' +
              '<div class="field"><label for="m_time">Preferred time</label><select class="select" id="m_time" name="time"><option>Morning (9am–12pm)</option><option>Afternoon (12–3pm)</option><option>Late afternoon (3–5pm)</option><option>No preference</option></select></div>' +
            '</div>' +
            '<div class="form-row">' +
              '<div class="field"><label for="m_service">Interested in</label><select class="select" id="m_service" name="service"><option>Not sure yet — help me decide</option><option>Opioid Detox</option><option>Alcohol Detox</option><option>Buprenorphine / Suboxone</option><option>Naltrexone / Vivitrol</option><option>IV Therapy</option><option>Polysubstance Detox</option></select></div>' +
              '<div class="field"><label for="m_visit">Visit type</label><select class="select" id="m_visit" name="visit"><option>In person (Scottsdale)</option><option>Telemedicine</option><option>Either works</option></select></div>' +
            '</div>' +
            '<div class="field"><label for="m_message">Questions and comments <span class="muted" style="font-weight:400;">(optional)</span></label><textarea class="textarea" id="m_message" name="message" placeholder="Ask us anything about our services, scheduling, or getting started."></textarea></div>' +
            '<div class="hp" aria-hidden="true"><label>Company<input type="text" name="company" tabindex="-1" autocomplete="off" /></label></div>' +
            '<button type="submit" class="btn btn-primary btn-lg btn-block" style="margin-top:.3rem;">Request appointment<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg></button>' +
            '<div class="privacy-note" style="display:flex;gap:.6rem;align-items:flex-start;font-size:.84rem;color:hsl(var(--muted-foreground));margin-top:.2rem;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:hsl(var(--primary));flex:none;margin-top:2px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
              '<span>Your information is protected and never shared. This is a safe, confidential first step.</span>' +
            '</div>' +
          '</form>' +
          '<div class="modal-success">' +
            '<div class="ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' +
            '<h2 class="h3" style="font-size:1.5rem;">Request received</h2>' +
            '<p class="muted" style="margin:.6rem auto 1.4rem;max-width:34ch;">Thank you for reaching out. A member of our team will contact you within one business day to confirm your appointment — confidentially.</p>' +
            '<button type="button" class="btn btn-outline" data-modal-close>Close</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(root);
      if (window.MedXFields) window.MedXFields.enhanceAll(root);
    }

    var dialog = root.querySelector('.modal-dialog');
    var form = root.querySelector('#modalApptForm');
    var lastFocus = null;

    function openModal(presetService) {
      lastFocus = document.activeElement;
      dialog.classList.remove('sent');
      if (presetService) {
        var sel = form.querySelector('#m_service');
        if (sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].text === presetService) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); break; } } }
      }
      root.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { var f = form.querySelector('#m_fname'); if (f) f.focus(); }, 80);
    }
    function closeModal() {
      if (window.MedXFields && window.MedXFields.close) window.MedXFields.close();
      root.classList.remove('open');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    window.openAppointmentModal = openModal;

    root.querySelectorAll('[data-modal-close]').forEach(function (el) { el.addEventListener('click', closeModal); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) closeModal(); });

    window.wireMedXForm(form, 'modal', function () {
      dialog.classList.add('sent');
      dialog.scrollTop = 0;
    });
    form.querySelectorAll('[data-validate] input, [data-validate] select, [data-validate] textarea').forEach(function (inp) {
      inp.addEventListener('input', function () { inp.closest('.field').classList.remove('invalid'); });
    });

    /* wire every "Request appointment" trigger across the site */
    var triggers = document.querySelectorAll('[data-appointment]');
    var byText = [].filter.call(document.querySelectorAll('a, button'), function (el) {
      if (el.closest('.modal-root')) return false;
      var t = (el.textContent || '').trim().toLowerCase();
      return /request\s+(an?\s+)?appointment/.test(t);
    });
    [].concat([].slice.call(triggers), byText).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(el.getAttribute('data-appointment-service'));
      });
    });
  }

  /* ---- Form validation (used on Contact) ---- */
  window.validateMedXForm = function (form) {
    var ok = true;
    form.querySelectorAll('[data-validate]').forEach(function (field) {
      var input = field.querySelector('input, textarea, select');
      if (!input) return;
      var v = (input.value || '').trim();
      var type = input.getAttribute('data-validate') || 'text';
      var valid = true;
      if (input.hasAttribute('required') && !v) valid = false;
      if (valid && v && type === 'email') valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (valid && v && type === 'phone') valid = (v.replace(/\D/g, '').length >= 10);
      field.classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    });
    return ok;
  };

  /* ---- Error banner (shared by the Contact form and the modal) ---- */
  function errorBox(form) {
    var box = form.querySelector('.form-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-error';
      box.setAttribute('role', 'alert');
      var btn = form.querySelector('[type="submit"]');
      if (btn && btn.parentNode) btn.parentNode.insertBefore(box, btn);
      else form.appendChild(box);
    }
    return box;
  }

  window.showMedXFormError = function (form, message) {
    var box = errorBox(form);
    box.textContent = message;
    box.style.display = 'block';
  };

  window.clearMedXFormError = function (form) {
    var box = form.querySelector('.form-error');
    if (box) box.style.display = 'none';
  };

  /* ---- Submit an inquiry to the send-inquiry Edge Function ---- */
  window.submitMedXInquiry = function (form, source) {
    if (!CONFIG.supabaseUrl) {
      return Promise.reject(new Error(NOT_CONFIGURED));
    }

    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? (el.value || '').trim() : '';
    }

    var headers = { 'Content-Type': 'application/json' };
    if (CONFIG.supabaseAnonKey) {
      headers['apikey'] = CONFIG.supabaseAnonKey;
      headers['Authorization'] = 'Bearer ' + CONFIG.supabaseAnonKey;
    }

    var url = CONFIG.supabaseUrl.replace(/\/$/, '') +
              '/functions/v1/' + (CONFIG.functionName || 'send-inquiry');

    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        first_name:     val('fname'),
        last_name:      val('lname'),
        email:          val('email'),
        phone:          val('phone'),
        service:        val('service'),
        visit_type:     val('visit'),
        preferred_date: val('date'),
        preferred_time: val('time'),
        message:        val('message'),
        company:        val('company'),   // honeypot - real people leave it empty
        source:         source || 'contact',
        page_url:       window.location.href
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || PHONE_FALLBACK);
        return data;
      });
    }, function () {
      // Network/DNS failure never reaches the .then above.
      throw new Error(PHONE_FALLBACK);
    });
  };

  /* ---- Wire a form to submit for real ---- */
  window.wireMedXForm = function (form, source, onSuccess) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!window.validateMedXForm(form)) {
        var bad = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
        if (bad) bad.focus();
        return;
      }

      var btn = form.querySelector('[type="submit"]');
      var label = btn ? btn.innerHTML : '';
      window.clearMedXFormError(form);
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

      window.submitMedXInquiry(form, source)
        .then(function () { onSuccess(); })
        .catch(function (err) {
          window.showMedXFormError(form, (err && err.message) || PHONE_FALLBACK);
        })
        .then(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = label; }
        });
    });
  };
})();

/* Mobile menu accordion groups */
(function(){
  document.addEventListener('click', function(e){
    var h = e.target.closest('.mm-head');
    if (!h) return;
    h.parentNode.classList.toggle('open');
  });
})();
