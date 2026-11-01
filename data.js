/*
  덕후브 데이터 파일
  ─────────────────────────────────────────────
  MVP 단계에서는 운영자가 이 파일에 IP와 일정을 직접 입력합니다.
  - IPS: 구독할 수 있는 작품 목록
  - EVENTS: 예약·응모·행사 일정 (day = 오늘 기준 며칠 뒤, time = 시각)
  실제 일정을 넣을 때는 day/time 대신 date: '2026-11-20T20:00' 형식으로 적으면 됩니다.
  ※ 아래 일정은 화면 시연용 예시 데이터입니다.
*/
window.DUKHUB_DATA = (function () {
  var IPS = [
    { id: 'bluearchive', name: '블루 아카이브', cat: 'game', color: '#2F6FDB', alias: ['블아', '블루아카'] },
    { id: 'genshin', name: '원신', cat: 'game', color: '#6D4FD6', alias: ['genshin'] },
    { id: 'starrail', name: '붕괴: 스타레일', cat: 'game', color: '#4A4FC4', alias: ['스타레일', '붕스'] },
    { id: 'arknights', name: '명일방주', cat: 'game', color: '#3F4A57', alias: ['방주'] },
    { id: 'sekai', name: '프로젝트 세카이', cat: 'game', color: '#0F766E', alias: ['프세카', '세카이'] },
    { id: 'umamusume', name: '우마무스메', cat: 'game', color: '#15803D', alias: ['우마'] },
    { id: 'zzz', name: '젠레스 존 제로', cat: 'game', color: '#B45309', alias: ['젠존제'] },
    { id: 'nikke', name: '승리의 여신: 니케', cat: 'game', color: '#B42318', alias: ['니케'] },
    { id: 'onepiece', name: '원피스', cat: 'anime', color: '#C2410C', alias: ['onepiece'] },
    { id: 'jujutsu', name: '주술회전', cat: 'anime', color: '#4338CA', alias: ['주회'] },
    { id: 'kimetsu', name: '귀멸의 칼날', cat: 'anime', color: '#BE185D', alias: ['귀칼'] },
    { id: 'haikyu', name: '하이큐!!', cat: 'anime', color: '#C2410C', alias: ['하이큐'] },
    { id: 'chainsaw', name: '체인소 맨', cat: 'anime', color: '#9F1239', alias: ['체인소맨'] },
    { id: 'spyfamily', name: '스파이 패밀리', cat: 'anime', color: '#047857', alias: ['스파패'] },
    { id: 'frieren', name: '장송의 프리렌', cat: 'anime', color: '#0E7490', alias: ['프리렌'] },
    { id: 'oshinoko', name: '최애의 아이', cat: 'anime', color: '#A21CAF', alias: ['최애아'] },
    { id: 'hololive', name: '홀로라이브', cat: 'vtuber', color: '#0369A1', alias: ['홀로'] },
    { id: 'nijisanji', name: '니지산지', cat: 'vtuber', color: '#1D4ED8', alias: ['니지'] },
    { id: 'stellive', name: '스텔라이브', cat: 'vtuber', color: '#7C3AED', alias: ['스텔'] },
    { id: 'isegye', name: '이세계아이돌', cat: 'vtuber', color: '#DB2777', alias: ['이세돌'] },
    { id: 'sololeveling', name: '나 혼자만 레벨업', cat: 'webtoon', color: '#1E40AF', alias: ['나혼렙'] },
    { id: 'orv', name: '전지적 독자 시점', cat: 'webtoon', color: '#374151', alias: ['전독시'] },
    { id: 'hwasan', name: '화산귀환', cat: 'webtoon', color: '#B91C1C', alias: ['화산'] },
    { id: 'lookism', name: '외모지상주의', cat: 'webtoon', color: '#525252', alias: ['외지주'] }
  ];

  // 예약·응모 채널 (실제 일정 입력 시 일정별 url을 해당 예약 페이지 주소로 바꿔 주세요)
  var CH = {
    naver: { name: '네이버 예약', url: 'https://booking.naver.com/' },
    interpark: { name: '인터파크 티켓', url: 'https://tickets.interpark.com/' },
    yes24: { name: 'YES24 티켓', url: 'https://ticket.yes24.com/' },
    melon: { name: '멜론티켓', url: 'https://ticket.melon.com/' }
  };

  // kind: open(예약 오픈) · deadline(응모 마감) · event(팝업·행사 시작) · news(새 소식)
  var RAW = [
    { id: 'e-demo', ip: 'bluearchive', kind: 'open', soon: 35, title: '팝업스토어 사전예약', ch: 'naver', note: '선착순 예약. 1인 1회만 예약할 수 있어요.' },
    { id: 'e01', ip: 'hololive', kind: 'open', day: 0, time: '22:00', title: '콜라보 카페 2차 예약', ch: 'naver', note: '회차별 90분 이용, 음료 1잔 필수 주문.' },
    { id: 'e02', ip: 'onepiece', kind: 'deadline', day: 2, time: '12:00', title: '한정 굿즈 응모 마감', ch: 'interpark', note: '추첨 결과는 마감 3일 뒤 개별 안내.' },
    { id: 'e03', ip: 'bluearchive', kind: 'open', day: 4, time: '18:00', title: '온리전 입장권 예매', ch: 'yes24', note: '얼리 입장권과 일반 입장권이 따로 열려요.' },
    { id: 'e04', ip: 'hololive', kind: 'event', day: 6, time: '11:00', title: '팝업스토어 오픈', ch: 'naver', note: '현장 대기 예약은 오픈 당일 오전에 열려요.' },
    { id: 'e05', ip: 'genshin', kind: 'open', day: 1, time: '19:00', title: '콜라보 카페 사전예약', ch: 'naver', note: '좌석 예약제로 운영돼요.' },
    { id: 'e06', ip: 'starrail', kind: 'open', day: 3, time: '20:00', title: '공식 굿즈 예약판매', ch: 'interpark', note: '예약판매 상품은 다음 달 순차 발송.' },
    { id: 'e07', ip: 'jujutsu', kind: 'event', day: 5, time: '10:30', title: '원화전 개막', ch: 'interpark', note: '전시 입장권은 회차 지정제예요.' },
    { id: 'e08', ip: 'kimetsu', kind: 'deadline', day: 7, time: '23:59', title: '복각 굿즈 응모 마감', ch: 'interpark', note: '' },
    { id: 'e09', ip: 'sekai', kind: 'open', day: 8, time: '20:00', title: '라이브 콘서트 선예매', ch: 'melon', note: '팬클럽 선예매 후 일반 예매가 열려요.' },
    { id: 'e10', ip: 'nijisanji', kind: 'open', day: 9, time: '19:00', title: '오프라인 팬미팅 예매', ch: 'yes24', note: '' },
    { id: 'e11', ip: 'sololeveling', kind: 'event', day: 10, time: '11:00', title: '팝업스토어 오픈', ch: 'naver', note: '' },
    { id: 'e12', ip: 'umamusume', kind: 'open', day: 11, time: '18:00', title: '콜라보 카페 예약', ch: 'naver', note: '' },
    { id: 'e13', ip: 'onepiece', kind: 'open', day: 12, time: '20:00', title: '팝업스토어 사전예약', ch: 'naver', note: '' },
    { id: 'e14', ip: 'frieren', kind: 'news', day: 1, time: '12:00', title: '공식 굿즈 2차 재판매 공지', ch: 'interpark', note: '' },
    { id: 'e15', ip: 'chainsaw', kind: 'deadline', day: 13, time: '23:59', title: '극장판 특전 응모 마감', ch: 'interpark', note: '' },
    { id: 'e16', ip: 'stellive', kind: 'open', day: 14, time: '20:00', title: '단독 콘서트 일반 예매', ch: 'melon', note: '' },
    { id: 'e17', ip: 'zzz', kind: 'open', day: 16, time: '19:00', title: '콜라보 카페 예약', ch: 'naver', note: '' },
    { id: 'e18', ip: 'isegye', kind: 'event', day: 18, time: '11:00', title: '팝업스토어 오픈', ch: 'naver', note: '' },
    { id: 'e19', ip: 'hwasan', kind: 'open', day: 20, time: '18:00', title: '굿즈 펀딩 오픈', ch: 'interpark', note: '' },
    { id: 'e20', ip: 'nikke', kind: 'open', day: 22, time: '20:00', title: '오프라인 행사 입장권 예매', ch: 'yes24', note: '' },
    { id: 'e21', ip: 'bluearchive', kind: 'deadline', day: 24, time: '23:59', title: '콜라보 굿즈 응모 마감', ch: 'interpark', note: '' },
    { id: 'p01', ip: 'onepiece', kind: 'open', day: -1, time: '20:00', title: '굿즈 응모 오픈', ch: 'interpark', note: '' },
    { id: 'p02', ip: 'hololive', kind: 'open', day: -2, time: '20:00', title: '콜라보 카페 1차 예약', ch: 'naver', note: '' },
    { id: 'p03', ip: 'bluearchive', kind: 'open', day: -4, time: '19:00', title: '한정 굿즈 예약판매', ch: 'interpark', note: '' }
  ];

  function atDay(day, time) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + day);
    var hm = time.split(':');
    d.setHours(+hm[0], +hm[1], 0, 0);
    return d;
  }
  function soon(min) {
    var d = new Date(Date.now() + min * 60000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    return d;
  }

  var EVENTS = RAW.map(function (r) {
    var when = r.date ? new Date(r.date) : (r.soon != null ? soon(r.soon) : atDay(r.day, r.time));
    var ch = CH[r.ch] || { name: r.ch, url: r.url || '' };
    return {
      id: r.id, ip: r.ip, kind: r.kind, title: r.title, note: r.note || '',
      at: when.toISOString(), channel: ch.name, url: r.url || ch.url
    };
  });

  return { ips: IPS, events: EVENTS };
})();
