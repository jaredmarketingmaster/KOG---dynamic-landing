/*! dtr_and_tracking.js v1.0.0 — 02_Web_Dev | DTR + atribución + dataLayer | sin dependencias */
/*
 * Configuración opcional (antes de cargar este script):
 *   window.WEBDEV_CONFIG = {
 *     params: ['utm_source', ...],          // parámetros a capturar (se suman a los por defecto)
 *     dtr: { aud: { allow: ['b2b','ecommerce'] } },   // reglas por parámetro (opcional)
 *     h1Map: { '1': 'H1 A', '2': 'H1 B' },  // lista blanca para data-dtr="h"
 *     maxLen: 60,                           // largo máximo de texto DTR
 *     attributionDays: 90,                  // vida del first-touch en localStorage
 *     decorateHosts: ['wa.me', ...],        // hosts cuyos links reciben las UTMs
 *     whatsappRefInText: false,             // agrega "[ref: fuente/campaña]" al mensaje de WhatsApp
 *     pageType: 'landing',                  // page_type en lp_view
 *     debug: false                          // loguea cada push en consola
 *   };
 *
 * Marcado HTML soportado:
 *   <h1 data-dtr="kw" data-dtr-template="{value} para crecer tu facturación">Fallback seguro</h1>
 *   <h1 data-dtr="h" data-dtr-map='{"2":"Otro H1"}'>Fallback</h1>         (lista blanca por mapa)
 *   <p data-dtr="city" data-dtr-allow="cordoba,rosario" data-dtr-case="title">Argentina</p>
 *   <a href="https://wa.me/549..." data-cta="hero">…</a>                  (cta_click + whatsapp_click)
 *   <form data-form-id="lead_v1">…<input type="hidden" name="utm_source">…</form>
 *   <iframe data-src="https://api.leadconnectorhq.com/widget/form/ID" data-append-utm></iframe>
 *
 * API pública: window.WebDevTracking.{push, getAttribution, decorateUrl, refresh}
 */
(function (w, d) {
  'use strict';
  if (w.WebDevTracking && w.WebDevTracking.version) return; // evita doble carga (GHL + página)

  var VERSION = '1.0.0';
  var CFG = w.WEBDEV_CONFIG || {};
  var DEFAULT_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'kw', 'city', 'headline',
    'gclid', 'fbclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid'
  ];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CLICK_IDS = ['gclid', 'fbclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid'];
  var PARAMS = uniq(DEFAULT_PARAMS.concat(CFG.params || []));
  var MAX_LEN = CFG.maxLen || 60;
  var DAYS = CFG.attributionDays || 90;
  var SS_KEY = 'webdev_session_params';
  var LS_KEY = 'webdev_first_touch';
  var DECORATE_HOSTS = uniq([
    'wa.me', 'api.whatsapp.com', 'web.whatsapp.com', 'whatsapp.com',
    'leadconnectorhq.com', 'msgsndr.com', 'gohighlevel.com', 'highlevel.com',
    'calendly.com', 'cal.com', 'tidycal.com', 'zcal.co'
  ].concat(CFG.decorateHosts || []));

  // ------------------------------------------------------------------ utils
  function uniq(a) { var o = [], s = {}; for (var i = 0; i < a.length; i++) { if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); } } return o; }
  function log() { if (CFG.debug && w.console) w.console.log.apply(w.console, ['[WebDev]'].concat([].slice.call(arguments))); }
  function safeGet(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function safeSet(store, k, v) { try { store.setItem(k, v); } catch (e) { /* modo privado / bloqueado */ } }
  function parseJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function uuid() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function getCookie(name) {
    var m = d.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  /** Sanitiza texto de URL para DTR: sin etiquetas, sin control, largo máximo. Se aplica SIEMPRE con textContent. */
  function sanitize(v, max, display) {
    if (v == null) return '';
    v = String(v);
    try { v = decodeURIComponent(v); } catch (e) { /* ya decodificado */ }
    if (display) {
      // Solo texto visible: kw=auditoria_google -> "auditoria google"; fuera etiquetas y símbolos de código.
      v = v.replace(/<[^>]*>?/g, ' ').replace(/[+_]/g, ' ').replace(/[^\p{L}\p{N}\s.,¿?¡!%&-]/gu, '');
    }
    v = v.replace(/<[^>]*>?/g, '')            // etiquetas completas o truncadas
         .replace(/[<>"'`{}\\]/g, '')         // caracteres de inyección
         .replace(/[\u0000-\u001F\u007F]/g, '') // control
         .replace(/\s+/g, ' ').trim();
    if (/^(javascript|data|vbscript):/i.test(v)) return '';
    return v.slice(0, max || MAX_LEN).trim();
  }
  function caseTransform(v, mode) {
    if (mode === 'title') return v.replace(/\S+/g, function (t) { return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); });
    if (mode === 'upper') return v.toUpperCase();
    if (mode === 'lower') return v.toLowerCase();
    if (mode === 'sentence') return v.charAt(0).toUpperCase() + v.slice(1);
    return v;
  }
  function norm(v) { return String(v || '').toLowerCase().normalize ? String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(v || '').toLowerCase(); }

  // ------------------------------------------------------------ atribución
  var url = new URL(w.location.href);
  var current = {};
  PARAMS.forEach(function (k) {
    var v = url.searchParams.get(k);
    if (v != null && v !== '') current[k] = sanitize(v, k.indexOf('utm_') === 0 || CLICK_IDS.indexOf(k) > -1 ? 200 : MAX_LEN);
  });

  // Sesión: los parámetros nuevos pisan a los anteriores (last-touch dentro de la sesión).
  var session = parseJSON(safeGet(w.sessionStorage, SS_KEY)) || {};
  for (var k in current) session[k] = current[k];
  if (!session.landing_page) session.landing_page = url.origin + url.pathname;
  if (!session.referrer && d.referrer && d.referrer.indexOf(url.origin) !== 0) session.referrer = d.referrer.slice(0, 300);
  safeSet(w.sessionStorage, SS_KEY, JSON.stringify(session));

  // First-touch persistente (90 días por defecto); solo se crea si hay datos de campaña.
  var first = parseJSON(safeGet(w.localStorage, LS_KEY));
  if (first && first.expires && Date.now() > first.expires) first = null;
  var hasCampaign = UTM_KEYS.concat(CLICK_IDS).some(function (x) { return current[x]; });
  if (!first && hasCampaign) {
    first = { data: current, landing_page: session.landing_page, referrer: session.referrer || '', ts: Date.now(), expires: Date.now() + DAYS * 864e5 };
    safeSet(w.localStorage, LS_KEY, JSON.stringify(first));
  }

  // fbc (formato Meta) si llegó fbclid y no hay cookie _fbc.
  if (current.fbclid && !getCookie('_fbc')) session.fbc = 'fb.1.' + Date.now() + '.' + current.fbclid;

  function getAttribution() {
    var out = {};
    var ft = (first && first.data) || {};
    PARAMS.forEach(function (p) { if (session[p] || ft[p]) out[p] = session[p] || ft[p]; });
    out.landing_page = session.landing_page;
    out.referrer = session.referrer || '';
    out.fbc = getCookie('_fbc') || session.fbc || '';
    out.fbp = getCookie('_fbp') || '';
    if (first) {
      UTM_KEYS.forEach(function (p) { if (ft[p]) out['ft_' + p] = ft[p]; });
      out.ft_landing_page = first.landing_page;
    }
    return out;
  }

  // ------------------------------------------------------------- dataLayer
  w.dataLayer = w.dataLayer || [];
  function push(event, params) {
    var attr = getAttribution();
    var payload = {
      event: event,
      event_id: uuid(),
      page_type: CFG.pageType || (d.body && d.body.getAttribute('data-page-type')) || 'landing',
      page_path: w.location.pathname,
      utm_source: attr.utm_source || '(direct)',
      utm_medium: attr.utm_medium || '(none)',
      utm_campaign: attr.utm_campaign || '(not set)',
      utm_content: attr.utm_content || '',
      utm_term: attr.utm_term || ''
    };
    if (params) for (var p in params) if (params[p] !== undefined) payload[p] = params[p];
    w.dataLayer.push(payload);
    log(event, payload);
    return payload.event_id;
  }

  // ---------------------------------------------------------------- DTR
  function applyDTR(root) {
    var nodes = (root || d).querySelectorAll('[data-dtr]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-dtr-done')) continue;
      el.setAttribute('data-dtr-done', '1');
      // data-dtr="h|kw": gana el primer parámetro con un valor válido; si ninguno, queda el fallback del HTML.
      var params = el.getAttribute('data-dtr').split('|');
      for (var q = 0; q < params.length; q++) {
        var res = resolveDTR(el, params[q].trim());
        if (!res) continue;
        el.textContent = res.text; // nunca innerHTML
        el.setAttribute('data-dtr-applied', res.param);
        break;
      }
    }
  }

  function resolveDTR(el, param) {
    var raw = session[param] != null ? session[param] : url.searchParams.get(param);
    if (raw == null || raw === '') return null;
    var rule = (CFG.dtr && CFG.dtr[param]) || {};
    var map = parseJSON(el.getAttribute('data-dtr-map')) || rule.map || (param === 'h' || param === 'headline' ? CFG.h1Map : null);
    var allowAttr = el.getAttribute('data-dtr-allow');
    var allow = allowAttr ? allowAttr.split(',') : rule.allow;
    var max = +el.getAttribute('data-dtr-max') || rule.max || MAX_LEN;
    var value, fromMap = false;
    if (map && map[String(raw).trim()]) {
      value = map[String(raw).trim()]; // lista blanca estricta por ID
      fromMap = true;
    } else if (map && (param === 'h' || !CFG.headlineFreeText)) {
      return null;                      // ID desconocido -> fallback
    } else {
      value = sanitize(raw, max, true);
      if (allow) {
        var n = norm(value), ok = false;
        for (var j = 0; j < allow.length; j++) if (norm(allow[j]).trim() === n) { ok = true; break; }
        if (!ok) return null;
        if (rule.labels) {
          if (!rule.labels[n]) return null; // en lista blanca pero sin texto aprobado -> fallback
          value = rule.labels[n];
          fromMap = true;
        }
      }
    }
    if (!value) return null;
    if (!fromMap) value = caseTransform(value, el.getAttribute('data-dtr-case') || rule.case);
    var tpl = fromMap ? null : (el.getAttribute('data-dtr-template') || rule.template);
    return { param: param, text: tpl ? tpl.replace('{value}', value) : value };
  }

  // -------------------------------------------- decoración de URLs salientes
  function hostMatches(host) {
    host = host.toLowerCase();
    for (var i = 0; i < DECORATE_HOSTS.length; i++) {
      var h = DECORATE_HOSTS[i];
      if (host === h || host.slice(-(h.length + 1)) === '.' + h) return true;
    }
    return false;
  }
  function isWhatsApp(href) { return /^(https?:)?\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|(www\.)?whatsapp\.com)\//i.test(href) || /^whatsapp:/i.test(href); }

  function decorateUrl(href, force) {
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return href;
    var u;
    try { u = new URL(href, w.location.href); } catch (e) { return href; }
    if (!force && !hostMatches(u.hostname)) return href;
    var attr = getAttribution();
    UTM_KEYS.concat(CLICK_IDS).forEach(function (k) {
      if (attr[k] && !u.searchParams.has(k)) u.searchParams.set(k, attr[k]);
    });
    if (CFG.whatsappRefInText && isWhatsApp(u.href) && (attr.utm_source || attr.utm_campaign)) {
      var text = u.searchParams.get('text') || '';
      var ref = '[ref: ' + [attr.utm_source, attr.utm_campaign].filter(Boolean).join('/') + ']';
      if (text.indexOf('[ref:') === -1) u.searchParams.set('text', (text ? text + ' ' : '') + ref);
    }
    return u.toString();
  }

  function decorateAll(root) {
    var scope = root || d;
    var links = scope.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var force = a.hasAttribute('data-append-utm');
      var next = decorateUrl(a.getAttribute('href'), force);
      if (next !== a.getAttribute('href')) a.setAttribute('href', next);
    }
    var frames = scope.querySelectorAll('iframe[data-src], iframe[src]');
    for (var f = 0; f < frames.length; f++) {
      var fr = frames[f];
      if (fr.getAttribute('data-utm-done')) continue;
      var src = fr.getAttribute('data-src') || fr.getAttribute('src');
      var dec = decorateUrl(src, fr.hasAttribute('data-append-utm'));
      if (fr.hasAttribute('data-src')) { fr.setAttribute('src', dec); fr.removeAttribute('data-src'); }
      else if (dec !== src) fr.setAttribute('src', dec);
      fr.setAttribute('data-utm-done', '1');
    }
  }

  // ------------------------------------------------- campos ocultos de forms
  function fillHiddenFields(root) {
    var attr = getAttribution();
    var inputs = (root || d).querySelectorAll('form input[type="hidden"], form input[data-attr-field]');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var key = inp.getAttribute('data-attr-field') || inp.name;
      if (key && attr[key] != null && !inp.value) inp.value = attr[key];
    }
  }

  // ------------------------------------------------------------- eventos
  function ctaText(el) { return (el.getAttribute('data-cta-text') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 100); }
  function ctaPosition(el) {
    var p = el.getAttribute('data-cta') || el.getAttribute('data-cta-position');
    if (p && p !== 'true' && p !== '') return p;
    var sec = el.closest ? el.closest('[data-section], section[id]') : null;
    return sec ? (sec.getAttribute('data-section') || sec.id) : 'unknown';
  }

  d.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a, button, [data-cta]') : null;
    if (!el) return;
    var href = el.getAttribute('href') || '';
    // Decoración en el momento del clic (cubre links insertados después por GHL/JS).
    if (href && el.tagName === 'A') {
      var dec = decorateUrl(href, el.hasAttribute('data-append-utm'));
      if (dec !== href) el.setAttribute('href', dec);
      href = dec;
    }
    var position = ctaPosition(el);
    if (isWhatsApp(href) || el.hasAttribute('data-whatsapp')) {
      push('whatsapp_click', { cta_text: ctaText(el), cta_position: position, link_url: href.split('?')[0] });
    }
    if (el.hasAttribute('data-cta') || /\bbtn\b|\bcta\b/.test(el.className || '')) {
      push('cta_click', { cta_text: ctaText(el), cta_position: position, link_url: href ? href.split('?')[0] : '' });
    }
  }, true);

  var formsStarted = {};
  d.addEventListener('focusin', function (e) {
    var form = e.target && e.target.form;
    if (!form) return;
    var id = form.getAttribute('data-form-id') || form.id || form.name || 'form';
    if (formsStarted[id]) return;
    formsStarted[id] = 1;
    push('form_start', { form_id: id });
  });

  d.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    fillHiddenFields(form.parentNode || d);
    var id = form.getAttribute('data-form-id') || form.id || form.name || 'form';
    var evid = push('form_submit', { form_id: id });
    var h = form.querySelector('input[name="event_id"]');
    if (h) h.value = evid; // mismo event_id para CAPI / CRM (deduplicación)
  }, true);

  // Formularios GHL embebidos (iframe) avisan por postMessage al enviarse.
  w.addEventListener('message', function (e) {
    if (!/leadconnectorhq\.com|msgsndr\.com|gohighlevel\.com/.test(e.origin || '')) return;
    var data = e.data;
    var str = typeof data === 'string' ? data : (data && (data.type || data.event || data.action)) || '';
    if (/submit|form-?submitted|survey-?submitted/i.test(JSON.stringify(str))) push('form_submit', { form_id: 'ghl_embed', form_provider: 'gohighlevel' });
    if (/appointment|booking|booked/i.test(JSON.stringify(str))) push('schedule', { form_id: 'ghl_calendar' });
  });

  // Scroll 50 / 90 (una vez por página). Throttle con setTimeout: rAF se pausa en pestañas sin pintar.
  var fired = {}, ticking = false;
  function onScroll() {
    ticking = false;
    var doc = d.documentElement;
    var max = Math.max(doc.scrollHeight - w.innerHeight, 1);
    var pct = Math.round((w.scrollY || doc.scrollTop) / max * 100);
    if (pct >= 50 && !fired[50]) { fired[50] = 1; push('scroll_50', { percent: 50 }); }
    if (pct >= 90 && !fired[90]) { fired[90] = 1; push('scroll_90', { percent: 90 }); w.removeEventListener('scroll', schedule); }
  }
  function schedule() { if (!ticking) { ticking = true; setTimeout(onScroll, 120); } }
  w.addEventListener('scroll', schedule, { passive: true });

  // ------------------------------------------------------------------ init
  function init() {
    applyDTR();
    decorateAll();
    fillHiddenFields();
    push('lp_view', { landing_page: session.landing_page, referrer: session.referrer || '', dtr_applied: Object.keys(current).filter(function (k) { return ['kw', 'city', 'headline', 'h', 'aud', 'loc'].indexOf(k) > -1; }).join(',') });
    // GHL inyecta formularios/calendarios después del load: re-decoramos lo nuevo.
    if (w.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return; pending = true;
        setTimeout(function () { pending = false; applyDTR(); decorateAll(); fillHiddenFields(); }, 200);
      }).observe(d.body, { childList: true, subtree: true });
    }
  }

  w.WebDevTracking = {
    version: VERSION,
    push: push,
    getAttribution: getAttribution,
    decorateUrl: function (h) { return decorateUrl(h, true); },
    refresh: function () { applyDTR(); decorateAll(); fillHiddenFields(); },
    sanitize: sanitize
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
