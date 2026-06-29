/*
 * Injected per page (executeScript on START, then the registered dynamic script on
 * every subsequent navigation within the granted origin). Re-reads run state from the
 * service worker (which enforces tab ownership) and RESUMES from the persisted step.
 *
 * Guards:
 *  - run-once per page load (avoid any double-injection double-run)
 *  - .catch so a rejected resume surfaces 'needs review' instead of silently stalling
 */
(function () {
  if (window.__kkj_started) return;
  window.__kkj_started = true;
  if (typeof CancelEngine === 'undefined' || typeof PLAYBOOKS === 'undefined') return;
  Promise.resolve(CancelEngine.resume(PLAYBOOKS.sandbox)).catch(function (e) {
    console.log('[끊어줌] resume error', e);
    try { CancelEngine.note('⚠️ 엔진 오류 — 사람 검토 필요: ' + e, '#c2630b'); } catch (_) {}
  });
})();
