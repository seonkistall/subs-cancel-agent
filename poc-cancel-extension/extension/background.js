/*
 * Service worker. Holds NO flow state. Responsibilities:
 *  - own session storage on behalf of content scripts (they read/write via messages,
 *    so the trusted-context access never races a SW restart)
 *  - enforce TAB OWNERSHIP (only the tab that started a run may read/advance it)
 *  - on START: await access level, register a per-origin dynamic content script, VERIFY it
 *    registered, then kick the current page; abort cleanly on registration failure
 *  - on DONE: unregister + snapshot the audit trail to storage.local
 */
const RUN_FILES = ['engine.js', 'playbooks.js', 'content.js'];

async function ensureAccess() {
  try { await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }); } catch (e) {}
}
ensureAccess(); // also on every SW startup

function ownsRun(run, sender) {
  return !!(run && sender && sender.tab && run.tabId === sender.tab.id);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  (async function () {
    try {
      if (msg.type === 'START') {
        await ensureAccess();
        try { await chrome.scripting.unregisterContentScripts({ ids: ['cancel-run'] }); } catch (e) {}
        let registered = false;
        try {
          await chrome.scripting.registerContentScripts([{
            id: 'cancel-run', matches: [msg.pattern], js: RUN_FILES, runAt: 'document_idle', persistAcrossSessions: false
          }]);
          const got = await chrome.scripting.getRegisteredContentScripts({ ids: ['cancel-run'] });
          registered = Array.isArray(got) && got.length > 0;
        } catch (e) { console.log('[끊어줌] register error', e); }

        if (!registered) {
          // Do NOT start a run we can't resume after the first navigation.
          sendResponse({ ok: false, error: 'content-script 등록 실패 — 권한/패턴 확인' });
          return;
        }

        await chrome.storage.session.set({
          run: { active: true, stepIndex: 0, tabId: msg.tabId, pre: null, post: null, outcome: null, reason: null, paused: false, log: [], origin: msg.pattern, startedAt: Date.now() }
        });
        try { await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: RUN_FILES }); }
        catch (e) {
          console.log('[끊어줌] executeScript error', e);
          await chrome.storage.session.remove('run');
          try { await chrome.scripting.unregisterContentScripts({ ids: ['cancel-run'] }); } catch (_) {}
          sendResponse({ ok: false, error: '첫 페이지 주입 실패: ' + e });
          return;
        }
        sendResponse({ ok: true });

      } else if (msg.type === 'GET_RUN') {
        const o = await chrome.storage.session.get('run');
        sendResponse({ run: ownsRun(o.run, sender) ? o.run : null });

      } else if (msg.type === 'SET_RUN') {
        const o = await chrome.storage.session.get('run');
        if (ownsRun(o.run, sender) && msg.run && msg.run.tabId === o.run.tabId) {
          await chrome.storage.session.set({ run: msg.run });
          sendResponse({ ok: true });
        } else { sendResponse({ ok: false }); }

      } else if (msg.type === 'DONE') {
        try { await chrome.scripting.unregisterContentScripts({ ids: ['cancel-run'] }); } catch (e) {}
        // Snapshot the audit trail (refund-evidence) to durable storage.local.
        const o = await chrome.storage.session.get('run');
        if (o.run) {
          const key = 'audit_' + (o.run.startedAt || Date.now());
          const rec = {}; rec[key] = { outcome: o.run.outcome, reason: o.run.reason, pre: o.run.pre, post: o.run.post, origin: o.run.origin, log: o.run.log, startedAt: o.run.startedAt, finishedAt: Date.now() };
          try { await chrome.storage.local.set(rec); } catch (e) {}
        }
        sendResponse({ ok: true });

      } else if (msg.type === 'RESET') {
        try { await chrome.scripting.unregisterContentScripts({ ids: ['cancel-run'] }); } catch (e) {}
        await chrome.storage.session.remove('run');
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown message type' });
      }
    } catch (e) {
      console.log('[끊어줌] bg error', e);
      try { sendResponse({ ok: false, error: String(e) }); } catch (_) {}
    }
  })();
  return true; // async sendResponse
});
