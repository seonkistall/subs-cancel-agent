/*
 * 끊어줌 Cancel Engine (PoC) — hardened per adversarial review.
 *
 * Control flow lives ONLY here (fixed primitives). Playbooks are DATA ONLY.
 * Outcome is ALWAYS three-way: SUCCESS / FAILED / INDETERMINATE.
 * INDETERMINATE is never auto-judged as success (refund-promise integrity).
 *
 * State is read/written THROUGH the service worker (GET_RUN / SET_RUN messages):
 *  - the SW always has trusted storage access (no content-script session-access race), and
 *  - the SW enforces tab ownership (a second same-origin tab cannot hijack/clobber the run).
 */
var CancelEngine = (function () {
  let pollInterval = null;
  let watchdog = null;
  function cancelTimers() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } if (watchdog) { clearTimeout(watchdog); watchdog = null; } }
  window.addEventListener('beforeunload', cancelTimers);
  window.addEventListener('pagehide', cancelTimers);

  function $(sel) { return document.querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function textOf(sel) { const el = $(sel); return el ? (el.innerText || el.textContent || '').trim() : null; }
  function containsAny(text, keys) { if (!text || !keys) return false; return keys.some(function (k) { return text.indexOf(k) >= 0; }); }
  function isActionable(el) { return el && !el.disabled && el.offsetParent !== null; }

  async function getRun() {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_RUN' });
    return resp && resp.run; // SW returns null if this tab does not own the active run
  }
  async function setRun(r) { await chrome.runtime.sendMessage({ type: 'SET_RUN', run: r }); }
  function logPush(run, op, detail) { run.log = run.log || []; run.log.push({ op: op, detail: detail, t: Date.now() }); }

  async function waitForSelector(sel, timeout) {
    const end = Date.now() + (timeout || 6000);
    while (Date.now() < end) { if ($(sel)) return $(sel); await sleep(120); }
    return null;
  }

  function setNativeValue(el, value) {
    const ctor = (el.tagName === 'SELECT') ? HTMLSelectElement : (el.tagName === 'TEXTAREA') ? HTMLTextAreaElement : HTMLInputElement;
    let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (!desc || !desc.set) desc = Object.getOwnPropertyDescriptor(ctor.prototype, 'value');
    desc.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function overlay(msg, color) {
    let d = document.getElementById('__kkj_overlay');
    if (!d) {
      d = document.createElement('div');
      d.id = '__kkj_overlay';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font:600 13px/1.5 -apple-system,sans-serif;padding:13px 18px;text-align:center;box-shadow:0 -2px 12px rgba(0,0,0,.2)';
      document.documentElement.appendChild(d);
    }
    d.style.background = color || '#111'; d.style.color = '#fff'; d.textContent = msg;
    return d;
  }
  function clearOverlay() { const d = document.getElementById('__kkj_overlay'); if (d) d.remove(); }
  function note(msg, color) { const o = overlay(msg, color || '#c2630b'); setTimeout(function () { if (o) o.remove(); }, 8000); }

  async function execStep(step, run) {
    switch (step.op) {
      case 'capturePre': {
        await waitForSelector(step.statusSelector, 5000);
        run.pre = textOf(step.statusSelector);
        logPush(run, 'capturePre', 'PRE = ' + run.pre);
        return {};
      }
      case 'click': {
        const el = await waitForSelector(step.selector, 6000);
        if (!isActionable(el)) { logPush(run, 'click', 'NOT actionable: ' + step.selector); return { missing: true }; }
        if (step.navigates) { logPush(run, 'click', step.selector + ' (navigates)'); return { clickEl: el }; }
        logPush(run, 'click', step.selector); el.click(); return {};
      }
      case 'dismissRetention': {
        const dismiss = await waitForSelector(step.dismissSelector, 6000);
        if (!isActionable(dismiss)) { logPush(run, 'dismissRetention', 'dismiss NOT actionable ' + step.dismissSelector); return { missing: true }; }
        logPush(run, 'dismissRetention', 'click ' + step.dismissSelector + ' (avoided trap ' + step.keepSelector + ')');
        if (step.navigates) return { clickEl: dismiss };
        dismiss.click(); return {};
      }
      case 'setReason': {
        const el = await waitForSelector(step.selector, 6000);
        if (!el) { logPush(run, 'setReason', 'NOT found ' + step.selector); return { missing: true }; }
        setNativeValue(el, step.value);
        logPush(run, 'setReason', 'native-setter set "' + step.value + '" on ' + step.selector);
        return {};
      }
      case 'pauseForHuman': {
        const wall = await waitForSelector(step.wallSelector, step.wallTimeoutMs || 1500);
        if (wall) {
          logPush(run, 'pauseForHuman', 'WALL present (' + step.wallSelector + ') → pause for human');
          overlay('🔒 보안 단계가 감지됐어요. 직접 완료해 주세요. 끝나면 자동으로 이어집니다.', '#c2630b');
          return { paused: true };
        }
        logPush(run, 'pauseForHuman', 'no wall within timeout → skip');
        return {};
      }
      case 'verify': {
        const el = await waitForSelector(step.statusSelector, step.timeoutMs || 4000);
        if (!el) { logPush(run, 'verify', 'POST unreadable within timeout → INDETERMINATE'); return { outcome: 'INDETERMINATE', reason: 'post-state unreadable / timeout' }; }
        const post = textOf(step.statusSelector);
        const preHadRenew = containsAny(run.pre, step.renewKeys);
        const postSuccess = containsAny(post, step.successKeys);
        const postRenew = containsAny(post, step.renewKeys);
        // cancelGone: null when no selector supplied (neutral, never a positive default)
        const cancelGone = step.cancelGoneSelector ? !$(step.cancelGoneSelector) : null;
        let outcome, reason;
        if (postSuccess && !postRenew && cancelGone !== false && preHadRenew) {
          outcome = 'SUCCESS'; reason = 'PRE 갱신중 → POST 만료/취소 ("' + post + '"), cancelGone=' + cancelGone;
        } else if (postRenew && !postSuccess) {
          outcome = 'FAILED'; reason = '여전히 갱신 중 ("' + post + '")';
        } else {
          outcome = 'INDETERMINATE';
          reason = 'PRE/POST 전이 불명확 (preHadRenew=' + preHadRenew + ', postSuccess=' + postSuccess + ', postRenew=' + postRenew + ', "' + post + '")';
        }
        logPush(run, 'verify', 'PRE="' + run.pre + '" POST="' + post + '" → ' + outcome);
        return { outcome: outcome, reason: reason, post: post };
      }
      default:
        logPush(run, step.op, 'unknown op'); return {};
    }
  }

  function pollForWallRemoval(playbook, step, pausedIndex) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async function () {
      try {
        if (!document.querySelector(step.wallSelector)) {
          clearInterval(pollInterval); pollInterval = null;
          let run = await getRun();
          if (run && run.active && run.paused) {
            run.paused = false; run.stepIndex = pausedIndex + 1;
            await setRun(run); clearOverlay(); resume(playbook);
          }
        }
      } catch (e) { console.log('[끊어줌] poll error', e); }
    }, 600);
    setTimeout(function () { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }, 300000);
  }

  function showResult(run) {
    const color = run.outcome === 'SUCCESS' ? '#15a06a' : run.outcome === 'FAILED' ? '#d33' : '#c2630b';
    const o = overlay('끊어줌 결과 → ' + run.outcome + ' · ' + (run.reason || ''), color);
    setTimeout(function () { if (o) o.remove(); }, 8000);
  }

  async function finish(run, outcome, reason, post) {
    run.active = false; run.paused = false; run.outcome = outcome; run.reason = reason; if (post) run.post = post;
    await setRun(run);
    chrome.runtime.sendMessage({ type: 'DONE' }).catch(function () {}); // SW unregisters + snapshots audit trail to storage.local
    showResult(run);
  }

  async function resume(playbook) {
    let run = await getRun();
    if (!run || !run.active) return; // not owner / no active run
    if (run.paused) run.paused = false;
    clearOverlay();

    let i = run.stepIndex || 0;
    while (i < playbook.steps.length) {
      const step = playbook.steps[i];
      const res = await execStep(step, run);

      if (res.missing) { run.stepIndex = i; await finish(run, 'INDETERMINATE', 'element missing/not actionable at step ' + i + ' (' + step.op + ')'); return; }
      if (res.paused) { run.paused = true; run.stepIndex = i; await setRun(run); pollForWallRemoval(playbook, step, i); return; }
      if (res.outcome) { run.stepIndex = i + 1; await finish(run, res.outcome, res.reason, res.post); return; }

      if (res.clickEl) {
        run.stepIndex = i + 1; run.paused = false; await setRun(run); // commit BEFORE navigating
        const beforeUrl = location.href;
        const committed = i;
        res.clickEl.click();
        // Watchdog: if no navigation happens, this content script survives → declare INDETERMINATE.
        // Cancelled by beforeunload/pagehide on a real (even slow) navigation.
        watchdog = setTimeout(async function () {
          try {
            if (location.href === beforeUrl) {
              let r = await getRun();
              if (r && r.active && r.stepIndex === committed + 1) {
                await finish(r, 'INDETERMINATE', 'click at step ' + committed + ' did not navigate (watchdog)');
              }
            }
          } catch (e) { console.log('[끊어줌] watchdog error', e); }
        }, 10000);
        return; // re-injection on the next page resumes at i+1
      }

      i = i + 1; run.stepIndex = i; await setRun(run); // non-nav: advance in-page
    }
    await finish(run, 'INDETERMINATE', 'playbook exhausted without verify');
  }

  return { resume: resume, note: note };
})();
