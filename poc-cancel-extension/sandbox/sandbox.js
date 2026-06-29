/*
 * Shared sandbox harness. Carries ?mode= across REAL page navigations so the
 * extension must resume from chrome.storage (not in-page state).
 * Modes: success (default) | fail | indeterminate | 2fa
 * Buttons opt into navigation with data-next="page.html"; a button may also carry
 * data-next-2fa="page.html" to branch when mode===2fa.
 */
(function () {
  var params = new URLSearchParams(location.search);
  var MODE = params.get('mode') || 'success';
  window.__MODE = MODE;

  window.__go = function (page) {
    location.href = page + '?mode=' + encodeURIComponent(MODE);
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-next],[data-next-2fa]');
    if (!t) return;
    if (t.disabled) return;
    e.preventDefault();
    if (t.hasAttribute('data-next-2fa') && MODE === '2fa') { window.__go(t.getAttribute('data-next-2fa')); return; }
    if (t.hasAttribute('data-next')) { window.__go(t.getAttribute('data-next')); }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.className = 'badge';
    b.textContent = 'sandbox mode: ' + MODE;
    document.body.appendChild(b);
  });
})();
