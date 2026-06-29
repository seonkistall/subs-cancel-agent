const $ = function (s) { return document.querySelector(s); };

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function render(run) {
  const el = $('#status');
  if (!run) { el.textContent = '대기 중. 샌드박스를 http://localhost 로 띄운 뒤 subscriptions.html 탭에서 실행하세요.'; return; }
  let s = '상태: ' + (run.active ? (run.paused ? '⏸ 사람 대기 (보안단계)' : '▶ 실행 중') : '■ 완료');
  s += '\n스텝 인덱스: ' + run.stepIndex;
  if (run.pre) s += '\nPRE : ' + run.pre;
  if (run.post) s += '\nPOST: ' + run.post;
  if (run.outcome) s += '\n\n▶ 결과: ' + run.outcome + (run.reason ? ('\n   ' + run.reason) : '');
  if (run.log && run.log.length) s += '\n\n── 로그 ──\n' + run.log.map(function (l) { return ' • ' + l.op + ': ' + (l.detail || ''); }).join('\n');
  el.textContent = s;
}

async function refresh() { const o = await chrome.storage.session.get('run'); render(o.run); }

$('#go').addEventListener('click', async function () {
  const t = await activeTab(); // fetch tab first; permissions.request follows immediately (user-activation window)
  let u;
  try { u = new URL(t.url); } catch (e) { $('#status').textContent = '이 탭의 URL을 읽을 수 없습니다.'; return; }

  if (u.protocol === 'file:') {
    $('#status').textContent = '⚠️ file:// 에서는 동작하지 않습니다.\n샌드박스를 서버로 띄우세요:\n  node server.js 8000\n그리고 http://localhost:8000/subscriptions.html 로 여세요.';
    return;
  }
  // Chrome match patterns do NOT allow ports → scheme + hostname only.
  const pattern = u.protocol + '//' + u.hostname + '/*';

  let granted = false;
  try { granted = await chrome.permissions.request({ origins: [pattern] }); }
  catch (e) { $('#status').textContent = '권한 요청 실패: ' + e; return; }
  if (!granted) { $('#status').textContent = '권한 거부됨 — 취소를 진행할 수 없습니다.'; return; }

  const resp = await chrome.runtime.sendMessage({ type: 'START', tabId: t.id, pattern: pattern });
  if (resp && resp.ok === false) { $('#status').textContent = '시작 실패: ' + (resp.error || '알 수 없음'); return; }
  $('#status').textContent = '시작함… (' + pattern + ')';
  setTimeout(refresh, 700);
});

$('#reset').addEventListener('click', async function () {
  await chrome.runtime.sendMessage({ type: 'RESET' });
  setTimeout(refresh, 250);
});

chrome.storage.session.onChanged.addListener(refresh);
refresh();
