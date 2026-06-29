/*
 * Per-vendor playbooks = DATA ONLY (selectors / URLs / locale strings).
 * NO control flow here. The bundled engine (engine.js) interprets a FIXED set
 * of ops; this object only parameterizes them. This is the Chrome-Web-Store-safe
 * boundary surfaced by the feasibility audit: remote config may patch these
 * fields, but a genuinely new flow shape needs a new engine primitive (= re-review).
 *
 * Success/expiry strings are locale-aware (Korean + English) so verification keys
 * on TEXT, never color/English-only.
 */
var PLAYBOOKS = {
  sandbox: {
    vendor: 'sandbox',
    steps: [
      { op: 'capturePre', statusSelector: '#status' },
      { op: 'click', selector: '#manage-link', navigates: true },
      { op: 'click', selector: '#cancel-btn', navigates: true },
      { op: 'pauseForHuman', wallSelector: '#twofa-wall' },
      { op: 'dismissRetention', dismissSelector: '#continue-cancel', keepSelector: '#keep-plan', navigates: true },
      { op: 'setReason', selector: '#reason-select', value: '너무 비쌈' },
      { op: 'click', selector: '#reason-continue', navigates: true },
      { op: 'click', selector: '#confirm-cancel', navigates: true },
      {
        op: 'verify',
        statusSelector: '#status',
        successKeys: ['만료', 'Expires', 'Canceled', '취소됨'],
        renewKeys: ['자동 갱신', 'Renews'],
        cancelGoneSelector: '#cancel-btn',
        timeoutMs: 4000
      }
    ]
  }
};
