# 크리스마스 디지털 방명록 (Christmas Guestbook)

QR로 접속한 휴대폰에서 그림과 한마디를 보내면, 미디어월(큰 화면)에 오너먼트처럼 떠오르는
크리스마스 방명록입니다. 서버 없이 GitHub Pages에서 동작합니다.

- 미디어월: https://fingko0102.github.io/christmas-guestbook/
- 참여(그리기): https://fingko0102.github.io/christmas-guestbook/?mode=draw

## 화면

| 화면 | 주소 | 설명 |
| --- | --- | --- |
| 미디어월 | `?mode=wall&room=XXXX` (데스크톱은 기본값) | 밤하늘·눈·트리 위로 방명록 그림이 떠다닙니다. 오른쪽 아래에 참여 QR·방 코드가 있습니다. |
| 그리기 | `?mode=draw&room=XXXX` | 휴대폰용 캔버스. QR을 스캔하면 이 화면으로 바로 들어옵니다. |

방 코드를 비우면 미디어월은 새 코드를 만들고, 그리기 화면은 `DEMO` 체험 모드로 열립니다.

## 쓰는 법

1. 큰 화면에서 미디어월을 엽니다. 화면 아래쪽 QR을 휴대폰 카메라로 스캔합니다.
2. 휴대폰에서 그림을 그리고 이름·한마디를 적은 뒤 **미디어월에 보내기**를 누릅니다.
3. 미디어월에 그림이 반짝이며 떠오릅니다. 그림을 누르면 크게 볼 수 있습니다.
4. 미디어월에서 바로 그려보려면 **이 화면에서 바로 그려보기**를 누릅니다.

## 동작 방식

- **같은 기기/브라우저**: `BroadcastChannel` + `localStorage`로 탭 사이를 바로 잇습니다.
- **다른 기기(휴대폰 ↔ 미디어월)**: PeerJS(WebRTC) 데이터 채널로 그림을 직접 주고받습니다
  (`vendor/peerjs.min.js`, 공개 시그널링 서버 사용). 미디어월이 열려 있어야 연결됩니다.
- 미디어월이 닫혀 있으면 그림은 저장해 두었다가, 열리면 최근 30분 이내 그림 하나를 이어받습니다.
- 그림은 캔버스에서 여백을 잘라 투명 PNG로 만들어 보냅니다.

## 파일 구성

```
index.html            화면 구조 (미디어월 / 그리기)
style.css             스타일
js/scene.js           밤하늘 별·눈 캔버스
js/drawer.js          그리기 캔버스 컴포넌트 (팔레트·굵기·지우개·되돌리기·보내기)
js/bus.js             PeerJS + BroadcastChannel + localStorage 연결 계층
js/samples.js         예시 그림 6개 (참여 전 미리보기)
js/wall.js            미디어월 (QR·오너먼트 배치·저장/복원)
js/draw-page.js       그리기 화면
js/ui.js              토스트·모달·클립보드
js/app.js             모드/방 코드 결정
vendor/               qrcode-generator(MIT), peerjs(MIT)
```

`?debug=1`을 붙이면 오류를 `window.__errs`에 모아 둡니다(검사용).
