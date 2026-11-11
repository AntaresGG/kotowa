// The static builder bundles the locale here, so language selection needs no fetch.
(function () {
  'use strict';
  var messages = /* LOCALE_MESSAGES */ {};
  var key = 'kotowa:language';
  var root = document.documentElement;
  var attributes = ['aria-label', 'aria-valuetext', 'placeholder', 'title', 'alt'];
  function supported(value) { return value === 'en' || value === 'zh-CN'; }
  function browserLanguage() { return /^zh(?:-|$)/i.test(navigator.language || '') ? 'zh-CN' : 'en'; }
  var language = browserLanguage();
  try {
    var saved = localStorage.getItem(key);
    if (supported(saved)) language = saved;
  } catch (e) { /* storage blocked; use the browser preference */ }
  root.lang = language;

  function t(message, params) {
    var template = language === 'zh-CN' && Object.prototype.hasOwnProperty.call(messages, message) ? messages[message] : message;
    return template.replace(/\{(\w+)\}/g, function (token, name) {
      return params && params[name] !== undefined ? String(params[name]) : token;
    });
  }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function html(message, params) {
    return '<span data-i18n="' + esc(message) + '"' + (params ? ' data-i18n-params="' + esc(JSON.stringify(params)) + '"' : '') + '>' + esc(t(message, params)) + '</span>';
  }
  function text(element, message, params) {
    element.dataset.i18n = message;
    element.dataset.i18nParams = JSON.stringify(params || {});
    element.textContent = t(message, params);
  }
  function apply() {
    var selector = ['[data-i18n]'].concat(attributes.map(function (name) { return '[data-i18n-' + name + ']'; })).join(',');
    document.querySelectorAll(selector).forEach(function (element) {
      var params = {};
      try { params = JSON.parse(element.dataset.i18nParams || '{}'); } catch (e) { /* ignore invalid parameters */ }
      if (element.hasAttribute('data-i18n')) {
        element.textContent = t(element.dataset.i18n, params);
        // Headings inside Chinese learning content describe the current UI language.
        element.lang = language;
      }
      attributes.forEach(function (name) {
        var message = element.getAttribute('data-i18n-' + name);
        if (message !== null) element.setAttribute(name, t(message, params));
      });
    });
    var picker = document.getElementById('language-select');
    if (picker) picker.value = language;
  }
  function choose(value, persist) {
    language = supported(value) ? value : browserLanguage();
    root.lang = language;
    if (persist) {
      try { localStorage.setItem(key, language); } catch (e) { /* session-only choice */ }
    }
    apply();
    document.dispatchEvent(new CustomEvent('kotowa:language', { detail: { language: language } }));
  }
  window.KotowaI18n = { t: t, html: html, text: text, apply: apply };
  document.addEventListener('DOMContentLoaded', function () {
    apply();
    document.getElementById('language-select').addEventListener('change', function (event) { choose(event.target.value, true); });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) choose(event.newValue, false);
  });
})();
