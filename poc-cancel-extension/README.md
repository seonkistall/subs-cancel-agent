# 끊어줌 — 취소 엔진 PoC

**무엇을 증명하나:** 단 하나의 load-bearing 메커니즘을 진짜 계정 없이 E2E로 증명한다 —
온디바이스 MV3 확장이 (1) 설치 시 권한 0 + 취소 클릭 순간에만 해당 도메인 권한 요청,
(2) **진짜 페이지 이동**을 가로질러 chrome.storage 기반으로 재개,
(3) 리텐션 다크패턴을 회피해 뚫고, (4) React-controlled 입력을 native-setter로 채우고,
(5) 2FA 벽에서 사람에게 핸드오프했다가 재개하고, (6) **before/after DOM diff로 SUCCESS/FAILED/INDETERMINATE 3분기 판정**(판정불가는 절대 자동성공 처리 안 함)을 한다.

> 이건 실현성 감사(`feasibility audit`)의 `poc_spec`을 그대로 구현한 것입니다.
> 제어 흐름은 전부 번들된 `engine.js`에, 벤더 플레이북은 `playbooks.js`의 **데이터만**.

## 실행 방법

### 1) 샌드박스 서버 띄우기 (포트 고정 권장)
```
cd poc-cancel-extension/sandbox
python -m http.server 8000
```
→ http://localhost:8000/subscriptions.html

### 2) 확장 로드 (한 번)
1. Chrome 주소창에 `chrome://extensions`
2. 우상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → `poc-cancel-extension/extension` 폴더 선택
4. 설치 시 **"모든 사이트 읽기" 경고가 뜨지 않는지 확인** (그게 핵심 — host 권한 0)

### 3) 한 모드 돌리기
1. `http://localhost:8000/subscriptions.html?mode=success` 로 이동
2. 툴바의 끊어줌 아이콘 클릭 → 팝업에서 **"이 탭의 구독 취소 실행"**
3. localhost 권한 1회 허용(이때만 요청됨) → 엔진이 흐름을 끝까지 구동
4. 팝업의 로그 + 페이지 하단 결과 배너로 판정 확인

## 테스트 매트릭스 (acceptance criteria a–h)

| URL (`subscriptions.html?mode=`) | 기대 결과 | 검증 항목 |
|---|---|---|
| `success` | **SUCCESS** | b 네비 가로지름·재개 / c 리텐션 회피 / d native-setter / g 한글 키 매칭 |
| `fail` | **FAILED** → 환불 트리거 | e POST가 여전히 '자동 갱신' |
| `indeterminate` | **INDETERMINATE** → 사람검토 | e 판정불가를 성공으로 처리 안 함 |
| `2fa` | **SUCCESS** (사람 핸드오프 후) | f pauseForHuman → 사람이 코드확인 클릭 → 재개 |

- (a) 설치 시 권한 경고 0, 권한은 취소 클릭(유저 제스처) 때만 → `chrome://extensions`에서 확인
- (h) 팝업 로그가 before/after diff와 판정 근거(감사추적)를 보여줌

## 아키텍처 노트 (감사 반영)
- **번들 엔진 + 데이터 플레이북:** 원격 JSON을 인터프리터로 실행하는 패턴(웹스토어 금지)을 피함. 원격은 selector/문자열만, 흐름은 심사받은 코드.
- **just-in-time 권한:** `optional_host_permissions` + `chrome.permissions.request()`를 Cancel 클릭 안에서 → "모든 사이트" 공포 경고 회피 + 벤더별 신뢰 신호.
- **3분기 판정:** 환불 약속의 무결성. INDETERMINATE는 사람 검토(자동성공 금지).
- **Apple vs Google:** 실제 적용 시 Google Play 포털 = 무인 가까이, Apple 포털 = 2FA 때문에 **반드시 pauseForHuman 가이드**. (이 PoC의 `2fa` 모드가 그 패턴.)
- `webNavigation` 대신 `chrome.scripting.registerContentScripts`로 재주입 → 추가 경고 없음.

## 한계 (정직)
- 이건 **메커니즘 증명**입니다. 진짜 Apple/Google/벤더 사이트·계정·결제·서버 없음. 샌드박스가 시스템 언더 테스트.
- a~h가 전부 통과한 *다음에만*, 본인 계정으로 **실제 Google Play 웹 포털**(세션 유지되는 케이스)에 1회 수동 스파이크를 하세요. **실제 Apple 계정을 무인 자동화하지 마세요.**
- 한국 직접결제(넷플릭스닷컴·티빙·웨이브·쿠팡·통신사 번들)는 스토어 포털 밖 → 벤더별 플레이북 별도 필요.
