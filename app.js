/*
  덕후브 웹앱
  ─────────────────────────────────────────────
  화면: 온보딩 → 홈 / 캘린더 / 검색 / 마이페이지 (+ 구독 관리, 알림 설정, 알림함, 일정 상세)
  저장: 브라우저 localStorage (기기별 저장, 서버 없음)
  알림: 앱이 열려 있거나 홈 화면 앱이 백그라운드에 살아 있을 때 일정 시각에 맞춰 알림을 띄웁니다.
*/
(function () {
  'use strict';

  /* ───────── 데이터 ───────── */
  var DATA = window.DUKHUB_DATA;
  var IPS = DATA.ips;
  var IP = {};
  IPS.forEach(function (i) { IP[i.id] = i; });
  var EVENTS = DATA.events
    .map(function (e) { return Object.assign({}, e, { t: new Date(e.at) }); })
    .filter(function (e) { return IP[e.ip]; })
    .sort(function (a, b) { return a.t - b.t; });
  var EV = {};
  EVENTS.forEach(function (e) { EV[e.id] = e; });

  var CATS = [['all', '전체'], ['game', '게임'], ['anime', '애니'], ['vtuber', '버튜버'], ['webtoon', '웹툰']];
  var CAT = { game: '게임', anime: '애니', vtuber: '버튜버', webtoon: '웹툰' };
  var KIND = { open: '예약 오픈', deadline: '응모 마감', event: '팝업·행사', news: '새 소식' };
  var VERB = { open: '오픈', deadline: '마감', event: '시작', news: '공개' };
  var TIMINGS = [['1d', '하루 전', 1440], ['30m', '30분 전', 30], ['10m', '10분 전', 10], ['0m', '정각', 0]];
  var TMIN = {};
  TIMINGS.forEach(function (t) { TMIN[t[0]] = t[2]; });
  var DOW = '일월화수목금토';

  /* ───────── 저장 상태 ───────── */
  var KEY = 'dukhub.v1';
  var DEFAULTS = {
    onboarded: false,
    subs: [],                 // 구독한 IP id (추가한 순서)
    ipMute: {},               // IP별 알림 끔
    eventMute: {},            // 일정별 알림 끔
    master: true,             // 전체 알림
    timings: ['30m'],         // 알림 시점
    kinds: { open: true, deadline: true, event: true, news: false },
    dnd: false,               // 방해 금지(01~08시, 예약 오픈은 예외)
    nickname: '덕후',
    recent: [],               // 최근 검색어
    notified: {},             // 이미 보낸 알림 key → 시각
    inbox: [],                // 받은 알림 기록
    seenAt: 0
  };
  var S = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = Object.assign(clone(DEFAULTS), JSON.parse(raw));
        s.kinds = Object.assign(clone(DEFAULTS.kinds), s.kinds || {});
        return s;
      }
    } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }
    return clone(DEFAULTS);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } }

  /* 화면 임시 상태 */
  var ui = {
    homeIp: null,
    cal: startOfDay(new Date()),
    calMonth: null,
    calKind: 'all',
    calScope: 'subs',
    q: '',
    cat: 'all',
    onbCat: 'all',
    onbPick: [],
    subsSort: 'recent',
    editName: false,
    resetArm: false,
    sheet: null
  };
  ui.calMonth = new Date(ui.cal.getFullYear(), ui.cal.getMonth(), 1);

  /* ───────── 유틸 ───────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }
  function dayDiff(d) { return Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000); }
  function fmtDate(d) { return (d.getMonth() + 1) + '.' + d.getDate() + ' (' + DOW[d.getDay()] + ')'; }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtRemain(ms) {
    if (ms <= 0) return '지금';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return d + '일 ' + (h % 24) + '시간';
    if (h >= 1) return h + '시간 ' + (m % 60) + '분';
    var s = Math.floor(ms / 1000) % 60;
    return m + '분 ' + pad(s) + '초';
  }
  function dday(e) {
    if (e.t.getTime() < Date.now()) return { label: '종료', cls: 'past' };
    var n = dayDiff(e.t);
    if (n === 0) return { label: 'D-DAY', cls: 'today' };
    return { label: 'D-' + n, cls: n <= 3 ? 'soon' : '' };
  }
  function isSub(id) { return S.subs.indexOf(id) !== -1; }
  function myEvents() { return EVENTS.filter(function (e) { return isSub(e.ip); }); }
  function upcomingCount(ipId, days) {
    var now = Date.now(), lim = now + days * 86400000;
    return EVENTS.filter(function (e) { return e.ip === ipId && e.t >= now && e.t <= lim; }).length;
  }
  function avatar(ip, cls) {
    return '<span class="av ' + (cls || '') + '" style="background:' + esc(ip.color) + '" aria-hidden="true">' + esc(ip.name.charAt(0)) + '</span>';
  }
  function eventAlertOn(e) {
    return S.master && !S.ipMute[e.ip] && !S.eventMute[e.id] && S.kinds[e.kind];
  }
  function unread() { return S.inbox.filter(function (n) { return n.at > S.seenAt; }).length; }

  /* ───────── 아이콘 ───────── */
  var P = {
    home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
    cal: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5',
    user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
    bell: 'M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0',
    bellOff: 'M6 8a6 6 0 0110.2-4.3M18 8c0 7 3 9 3 9H9M6 8c0 2.6-.4 4.5-1 6M10.3 21a1.9 1.9 0 003.4 0M3 3l18 18',
    back: 'M15 5l-7 7 7 7',
    next: 'M9 5l7 7-7 7',
    plus: 'M12 5v14M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12l5 5L20 7',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
    heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
    pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14'
  };
  function ic(name, size) {
    var s = size || 22;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + P[name] + '"/></svg>';
  }
  function sw(on, action, label, extra) {
    return '<button class="sw" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '" data-action="' + action + '"' + (extra || '') + '></button>';
  }
  function header(title, opts) {
    opts = opts || {};
    return '<header class="hdr sub"><button class="icon-btn" data-action="back" aria-label="뒤로">' + ic('back') + '</button>' +
      '<h1>' + esc(title) + '</h1>' + (opts.right || '') + '</header>';
  }

  /* ───────── 라우터 ───────── */
  var lastRoute = '';
  function parse() {
    var h = location.hash.replace(/^#\/?/, '') || 'home';
    var parts = h.split('/');
    return { name: parts[0], arg: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  var VIEWS = {
    onboarding: viewOnboarding, home: viewHome, calendar: viewCalendar, search: viewSearch,
    my: viewMy, subs: viewSubs, alerts: viewAlerts, inbox: viewInbox
  };
  var TAB_OF = { home: 'home', calendar: 'calendar', search: 'search', my: 'my', subs: 'my', alerts: 'my', inbox: 'home' };

  function render() {
    var r = parse();
    if (!S.onboarded && r.name !== 'onboarding') { location.replace('#/onboarding'); return; }
    var key = r.name + '/' + (r.arg || '');
    if (key !== lastRoute && r.name === 'onboarding' && S.onboarded) ui.onbPick = S.subs.slice();
    var fn = VIEWS[r.name] || viewHome;
    var view = document.getElementById('view');
    view.innerHTML = fn(r.arg);
    var noTab = r.name === 'onboarding';
    view.classList.toggle('no-tab', noTab);
    renderTabbar(noTab ? null : (TAB_OF[r.name] || 'home'));
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    if (r.name === 'inbox') { S.seenAt = Date.now(); save(); }
    document.title = '덕후브';
    tickCountdowns();
  }
  function renderTabbar(active) {
    var nav = document.getElementById('tabbar');
    if (!active) { nav.hidden = true; return; }
    nav.hidden = false;
    var tabs = [['home', '홈', 'home'], ['calendar', '캘린더', 'cal'], ['search', '검색', 'search'], ['my', '마이페이지', 'user']];
    nav.innerHTML = tabs.map(function (t) {
      return '<a href="#/' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '>' + ic(t[2], 24) + '<span>' + t[1] + '</span></a>';
    }).join('');
  }

  /* ───────── 온보딩 ───────── */
  function viewOnboarding() {
    var list = IPS.filter(function (i) { return ui.onbCat === 'all' || i.cat === ui.onbCat; });
    var n = ui.onbPick.length;
    return '<div class="onb-h"><div class="brand" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:8px"><img src="icons/icon-192.png" alt="">덕후브</span>' +
      (S.onboarded ? '<a class="txt-btn" href="#/my" style="display:inline-flex;align-items:center">취소</a>' : '') + '</div>' +
      '<h1>어떤 작품을<br>덕질하고 있나요?</h1>' +
      '<p>구독한 작품의 예약·응모가 열리기 전에 알려드리고, 알림을 누르면 예약 페이지로 바로 이동해요.</p></div>' +
      '<div class="chips" role="group" aria-label="분류">' + CATS.map(function (c) {
        return '<button class="chip" data-action="onbCat" data-v="' + c[0] + '" aria-pressed="' + (ui.onbCat === c[0]) + '">' + c[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="tiles">' + list.map(function (i) {
        var on = ui.onbPick.indexOf(i.id) !== -1;
        return '<button class="tile" data-action="onbPick" data-id="' + i.id + '" aria-pressed="' + on + '">' +
          '<span class="chk">' + ic('check', 14) + '</span>' + avatar(i) +
          '<span class="nm">' + esc(i.name) + '</span><span class="ct">' + CAT[i.cat] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="cta"><button class="btn primary block" data-action="onbDone"' + (n ? '' : ' disabled') + '>' +
      (n ? n + '개 구독하고 시작하기' : '작품을 1개 이상 골라주세요') + '</button></div>';
  }

  /* ───────── 홈 ───────── */
  function viewHome() {
    var bellDot = unread() ? '<span class="dot"></span>' : '';
    var h = '<header class="hdr"><div class="brand"><img src="icons/icon-192.png" alt="">덕후브</div>' +
      '<a class="icon-btn" href="#/search" aria-label="검색">' + ic('search') + '</a>' +
      '<a class="icon-btn" href="#/inbox" aria-label="알림' + (bellDot ? ', 새 알림 있음' : '') + '">' + ic('bell') + bellDot + '</a></header>';

    if (!S.subs.length) {
      return h + '<div class="empty"><strong>아직 구독한 작품이 없어요</strong><p>작품을 구독하면 예약 오픈 소식이 여기에 모여요.</p>' +
        '<a class="btn primary sm" href="#/search">작품 찾아보기</a></div>';
    }
    if (ui.homeIp && !isSub(ui.homeIp)) ui.homeIp = null;

    // 내 구독 IP (가로 스크롤)
    h += '<div class="sec-h"><h2>내 구독 IP</h2><a href="#/subs">전체 보기</a></div>';
    h += '<div class="ip-row" role="group" aria-label="구독 IP로 소식 거르기">';
    h += '<button class="ip-pill" data-action="homeIp" data-id="" aria-pressed="' + (!ui.homeIp) + '"><span class="ring"><span class="all">전체</span></span><span class="name">전체</span></button>';
    S.subs.forEach(function (id) {
      var ip = IP[id]; if (!ip) return;
      h += '<button class="ip-pill" data-action="homeIp" data-id="' + id + '" aria-pressed="' + (ui.homeIp === id) + '"><span class="ring">' + avatar(ip, 'pill') + '</span><span class="name">' + esc(ip.name) + '</span></button>';
    });
    h += '<a class="ip-pill" href="#/search"><span class="ring"><span class="plus">' + ic('plus', 20) + '</span></span><span class="name">추가</span></a></div>';

    var list = myEvents().filter(function (e) { return !ui.homeIp || e.ip === ui.homeIp; });
    var now = Date.now();

    // 다음 오픈
    var next = list.filter(function (e) { return e.t > now && e.kind !== 'news'; })[0];
    if (next) {
      var ip = IP[next.ip];
      h += '<button class="next" data-action="openEvent" data-id="' + next.id + '">' +
        '<span class="top"><span class="pill">' + (dayDiff(next.t) === 0 ? '오늘 ' : fmtDate(next.t) + ' ') + fmtTime(next.t) + ' ' + VERB[next.kind] + '</span>' +
        '<span>' + (eventAlertOn(next) ? '알림 켜짐' : '알림 꺼짐') + '</span></span>' +
        '<span class="ipn">' + esc(ip.name) + ' · ' + KIND[next.kind] + '</span>' +
        '<span class="ttl">' + esc(next.title) + '</span>' +
        '<span class="bot"><span>' + VERB[next.kind] + '까지</span><span class="cd" data-countdown="' + next.t.getTime() + '">' + fmtRemain(next.t - now) + '</span></span></button>';
    }

    // 최신 소식 타임라인
    h += '<div class="sec-h"><h2>최신 소식</h2><span class="more">' + (ui.homeIp ? esc(IP[ui.homeIp].name) : '구독 IP 전체') + '</span></div>';
    var groups = [['오늘', []], ['내일', []], ['이번 주', []], ['다가오는 일정', []], ['지난 소식', []]];
    list.forEach(function (e) {
      var d = dayDiff(e.t);
      if (e.t < now) { if (d >= -4) groups[4][1].push(e); return; }
      if (d === 0) groups[0][1].push(e);
      else if (d === 1) groups[1][1].push(e);
      else if (d <= 7) groups[2][1].push(e);
      else if (d <= 31) groups[3][1].push(e);
    });
    groups[4][1].reverse();
    var any = false;
    groups.forEach(function (g) {
      if (!g[1].length) return;
      any = true;
      h += '<div class="group-h">' + g[0] + '</div><div class="tl">' + g[1].map(feedItem).join('') + '</div>';
    });
    if (!any) h += '<div class="empty"><p>예정된 소식이 없어요.</p></div>';
    return h;
  }
  function feedItem(e) {
    var ip = IP[e.ip], dd = dday(e), past = e.t < Date.now();
    return '<div class="tl-item' + (past ? ' past' : '') + '"><div class="tl-rail"><span class="node"></span><span class="line"></span></div>' +
      '<button class="card" data-action="openEvent" data-id="' + e.id + '">' +
      '<span class="meta">' + avatar(ip, 'sm') + '<span class="ipn">' + esc(ip.name) + '</span><span class="tag ' + dd.cls + '">' + dd.label + '</span></span>' +
      '<span class="ttl">' + esc(e.title) + '</span>' +
      '<span class="when">' + fmtDate(e.t) + ' ' + fmtTime(e.t) + ' ' + VERB[e.kind] + ' · ' + esc(e.channel) + '</span></button></div>';
  }

  /* ───────── 캘린더 ───────── */
  function viewCalendar() {
    var m = ui.calMonth, y = m.getFullYear(), mo = m.getMonth();
    var src = (ui.calScope === 'subs' ? myEvents() : EVENTS).filter(function (e) { return ui.calKind === 'all' || e.kind === ui.calKind; });
    var byDay = {};
    src.forEach(function (e) {
      var k = startOfDay(e.t).getTime();
      (byDay[k] = byDay[k] || []).push(e);
    });
    var h = '<header class="hdr"><h1>캘린더</h1></header>';
    h += '<div class="cal-h"><div class="m"><button class="icon-btn" data-action="calMove" data-v="-1" aria-label="이전 달">' + ic('back') + '</button>' +
      '<h2>' + y + '년 ' + (mo + 1) + '월</h2><button class="icon-btn" data-action="calMove" data-v="1" aria-label="다음 달">' + ic('next') + '</button></div>' +
      '<button class="chip" data-action="calScope" aria-pressed="' + (ui.calScope === 'all') + '">' + (ui.calScope === 'subs' ? '내 구독만' : '전체 IP') + '</button></div>';
    h += '<div class="chips" role="group" aria-label="일정 종류" style="margin:10px 0 8px">' + [['all', '전체']].concat(Object.keys(KIND).map(function (k) { return [k, KIND[k]]; })).map(function (k) {
      return '<button class="chip" data-action="calKind" data-v="' + k[0] + '" aria-pressed="' + (ui.calKind === k[0]) + '">' + k[1] + '</button>';
    }).join('') + '</div>';

    h += '<div class="cal-grid">' + DOW.split('').map(function (d, i) { return '<span class="dow' + (i === 0 ? ' sun' : '') + '">' + d + '</span>'; }).join('');
    var first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    for (var i = 0; i < first; i++) h += '<span class="day out" aria-hidden="true"></span>';
    for (var d = 1; d <= days; d++) {
      var date = new Date(y, mo, d), evs = byDay[date.getTime()] || [];
      var cls = 'day' + (sameDay(date, new Date()) ? ' today' : '');
      var dots = evs.slice(0, 3).map(function (e) { return '<i class="' + (e.kind === 'deadline' ? 'deadline' : '') + '"></i>'; }).join('');
      h += '<button class="' + cls + '" data-action="calDay" data-v="' + date.getTime() + '" aria-pressed="' + sameDay(date, ui.cal) + '" aria-label="' + (mo + 1) + '월 ' + d + '일' + (evs.length ? ', 일정 ' + evs.length + '개' : '') + '">' +
        '<span class="n">' + d + '</span><span class="dots">' + dots + '</span></button>';
    }
    h += '</div>';

    var sel = byDay[startOfDay(ui.cal).getTime()] || [];
    h += '<div class="divider"></div><div class="sec-h"><h2>' + (ui.cal.getMonth() + 1) + '월 ' + ui.cal.getDate() + '일 (' + DOW[ui.cal.getDay()] + ')</h2><span class="more">일정 ' + sel.length + '개</span></div>';
    if (!sel.length) h += '<p class="note" style="padding-top:0">이 날은 ' + (ui.calScope === 'subs' ? '구독한 작품의 ' : '') + '일정이 없어요.</p>';
    else h += '<div class="list">' + sel.map(function (e) {
      var ip = IP[e.ip], on = eventAlertOn(e) && isSub(e.ip);
      return '<button class="row" data-action="openEvent" data-id="' + e.id + '">' +
        '<span style="width:48px;text-align:center;font-weight:800">' + fmtTime(e.t) + '</span>' +
        '<span class="body"><span class="s">' + esc(ip.name) + ' · <span class="kind ' + e.kind + '">' + KIND[e.kind] + '</span></span><br><span class="t">' + esc(e.title) + '</span></span>' +
        '<span class="muted" aria-label="' + (on ? '알림 켜짐' : '알림 꺼짐') + '">' + ic(on ? 'bell' : 'bellOff', 20) + '</span></button>';
    }).join('') + '</div>';
    return h;
  }

  /* ───────── 검색 ───────── */
  function viewSearch() {
    var h = '<header class="hdr"><h1>IP 검색</h1></header>' +
      '<form class="search" role="search" data-form="search">' + ic('search', 20) +
      '<label class="sr" for="q">작품 검색</label><input id="q" type="search" placeholder="작품, 게임, 버튜버 이름" autocomplete="off" value="' + esc(ui.q) + '">' +
      (ui.q ? '<button type="button" class="icon-btn" style="width:36px;height:36px" data-action="clearQ" aria-label="검색어 지우기">' + ic('x', 18) + '</button>' : '') + '</form>' +
      '<div class="chips" role="group" aria-label="분류">' + CATS.map(function (c) {
        return '<button class="chip" data-action="cat" data-v="' + c[0] + '" aria-pressed="' + (ui.cat === c[0]) + '">' + c[1] + '</button>';
      }).join('') + '</div><div id="results">' + searchResults() + '</div>';
    return h;
  }
  function searchResults() {
    var q = ui.q.trim().toLowerCase().replace(/\s+/g, '');
    var h = '';
    if (!q) {
      if (S.recent.length) {
        h += '<div class="sec-h"><h2 style="font-size:15px">최근 검색</h2><button class="more" data-action="recentClear">전체 삭제</button></div><div class="recent">' +
          S.recent.map(function (r, i) {
            return '<span><button data-action="recentPick" data-v="' + esc(r) + '">' + esc(r) + '</button><button class="x" data-action="recentDel" data-i="' + i + '" aria-label="' + esc(r) + ' 삭제">' + ic('x', 12) + '</button></span>';
          }).join('') + '</div>';
      }
      var ranked = IPS.filter(function (i) { return ui.cat === 'all' || i.cat === ui.cat; })
        .map(function (i) { return { ip: i, n: upcomingCount(i.id, 14) }; })
        .sort(function (a, b) { return b.n - a.n; });
      h += '<div class="sec-h"><h2 style="font-size:15px">2주 안에 오픈이 많은 IP</h2></div><div class="list">' +
        ranked.map(function (r, idx) { return ipRow(r.ip, idx + 1); }).join('') + '</div>';
      return h;
    }
    var found = IPS.filter(function (i) {
      if (ui.cat !== 'all' && i.cat !== ui.cat) return false;
      var hay = [i.name].concat(i.alias || []).join('|').toLowerCase().replace(/\s+/g, '');
      return hay.indexOf(q) !== -1;
    });
    if (!found.length) return '<div class="empty"><strong>“' + esc(ui.q) + '” 검색 결과가 없어요</strong><p>아직 등록되지 않은 작품이에요. 마이페이지의 작품 추가 요청으로 알려주세요.</p></div>';
    return '<div class="sec-h"><h2 style="font-size:15px">검색 결과 ' + found.length + '개</h2></div><div class="list">' + found.map(function (i) { return ipRow(i); }).join('') + '</div>';
  }
  function ipRow(ip, rank) {
    var on = isSub(ip.id), n = upcomingCount(ip.id, 14);
    return '<div class="row">' + (rank ? '<span class="rank">' + rank + '</span>' : '') + avatar(ip) +
      '<span class="body"><span class="t">' + esc(ip.name) + '</span><br><span class="s">' + CAT[ip.cat] + ' · ' + (n ? '2주 내 일정 ' + n + '건' : '예정 일정 없음') + '</span></span>' +
      '<button class="sub-btn" data-action="toggleSub" data-id="' + ip.id + '" aria-pressed="' + on + '" aria-label="' + esc(ip.name) + (on ? ' 구독 취소' : ' 구독') + '">' + (on ? '구독 중' : '구독') + '</button></div>';
  }

  /* ───────── 구독 관리 ───────── */
  function viewSubs() {
    var ids = S.subs.slice();
    if (ui.subsSort === 'recent') ids.reverse();
    else ids.sort(function (a, b) { return upcomingCount(b, 31) - upcomingCount(a, 31); });
    var h = header('구독 관리');
    h += '<div class="sec-h" style="padding-top:4px"><span><b>' + ids.length + '개</b> IP 구독 중</span><div style="display:flex;gap:6px">' +
      '<button class="chip" data-action="subsSort" data-v="recent" aria-pressed="' + (ui.subsSort === 'recent') + '">최근 추가순</button>' +
      '<button class="chip" data-action="subsSort" data-v="busy" aria-pressed="' + (ui.subsSort === 'busy') + '">일정 많은 순</button></div></div>';
    h += '<div class="banner" style="margin-top:0"><span class="s">알림을 끈 IP는 홈과 캘린더에는 그대로 보이고, 푸시 알림만 오지 않아요.</span></div>';
    if (!ids.length) h += '<div class="empty"><p>구독한 작품이 없어요.</p></div>';
    h += '<div class="list">' + ids.map(function (id) {
      var ip = IP[id]; if (!ip) return '';
      var n = upcomingCount(id, 31);
      return '<div class="row">' + avatar(ip) + '<span class="body"><span class="t">' + esc(ip.name) + '</span><br><span class="s">' + CAT[ip.cat] + ' · ' + (n ? '예정 일정 ' + n + '건' : '예정 일정 없음') + '</span></span>' +
        sw(!S.ipMute[id], 'ipMute', ip.name + ' 알림', ' data-id="' + id + '"') +
        '<button class="icon-btn" data-action="toggleSub" data-id="' + id + '" aria-label="' + esc(ip.name) + ' 구독 취소">' + ic('x', 18) + '</button></div>';
    }).join('') + '</div>';
    h += '<div class="sec"><a class="btn line block" style="margin-top:16px" href="#/search">' + ic('plus', 18) + 'IP 더 구독하기</a></div>';
    return h;
  }

  /* ───────── 알림 설정 ───────── */
  function viewAlerts() {
    var h = header('알림 설정');
    h += '<div class="banner strong"><div><div class="t">푸시 알림 받기</div><div class="s">끄면 모든 덕후브 알림이 멈춰요</div></div>' + sw(S.master, 'master', '푸시 알림 받기') + '</div>';

    var perm = permState();
    var permText = {
      granted: ['기기 알림 허용됨', '예약 오픈이 다가오면 휴대폰 알림으로도 알려드려요.'],
      default: ['기기 알림 허용이 필요해요', '허용하지 않으면 앱 안에서만 알림이 보여요.'],
      denied: ['기기 알림이 차단돼 있어요', '브라우저(또는 휴대폰) 설정에서 덕후브 알림을 허용해 주세요.'],
      unsupported: ['이 브라우저는 기기 알림을 지원하지 않아요', '아이폰은 Safari에서 공유 → ‘홈 화면에 추가’ 후 앱으로 열면 알림을 받을 수 있어요.']
    }[perm];
    h += '<div class="banner"><div><div class="t" style="font-size:14px">' + permText[0] + '</div><div class="s">' + permText[1] + '</div></div>' +
      (perm === 'default' ? '<button class="btn primary sm" data-action="perm">허용하기</button>' : '') + '</div>';

    h += '<div class="label">알림 시점 · 여러 개 선택 가능</div><div class="seg" role="group" aria-label="알림 시점">' + TIMINGS.map(function (t) {
      return '<button data-action="timing" data-v="' + t[0] + '" aria-pressed="' + (S.timings.indexOf(t[0]) !== -1) + '">' + t[1] + '</button>';
    }).join('') + '</div><p class="note">기본값은 오픈 30분 전이에요. 정각 알림을 함께 켜 두면 오픈 순간에 한 번 더 알려드려요.</p>';

    h += '<div class="label">받을 알림 종류</div>';
    var desc = { open: '굿즈·팝업·카페 예약이 열릴 때', deadline: '추첨·응모 마감이 다가올 때', event: '팝업스토어·전시 등 행사 첫날', news: '재판매·일정 공개 같은 공식 공지' };
    Object.keys(KIND).forEach(function (k) {
      h += '<div class="set-row"><div><div class="t">' + KIND[k] + '</div><div class="s">' + desc[k] + '</div></div>' + sw(S.kinds[k], 'kind', KIND[k], ' data-v="' + k + '"') + '</div>';
    });
    h += '<div class="label">기타</div>';
    h += '<div class="set-row"><div><div class="t">방해 금지 시간</div><div class="s">01:00 ~ 08:00 · 예약 오픈 알림은 예외</div></div>' + sw(S.dnd, 'dnd', '방해 금지 시간') + '</div>';
    h += '<a class="menu-row" href="#/subs"><span class="grow">IP별 알림 관리</span><span class="val">구독 ' + S.subs.length + '개 · 알림 켬 ' + S.subs.filter(function (id) { return !S.ipMute[id]; }).length + '개</span>' + ic('next', 18) + '</a>';
    h += '<div class="sec" style="margin-top:14px"><button class="btn ghost block" data-action="test">' + ic('bell', 18) + '테스트 알림 보내기</button></div>';
    h += '<p class="note">웹앱 알림은 덕후브가 열려 있거나, 홈 화면에 추가한 앱이 백그라운드에 남아 있을 때 울려요. 앱을 완전히 종료한 상태의 알림은 다음 단계(서버 푸시)에서 지원할 예정이에요.</p>';
    return h;
  }
  function permState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  /* ───────── 알림함 ───────── */
  function viewInbox() {
    var h = header('알림', { right: '<a class="icon-btn" href="#/alerts" aria-label="알림 설정">' + ic('gear') + '</a>' });
    if (!S.inbox.length) {
      return h + '<div class="empty"><strong>아직 받은 알림이 없어요</strong><p>구독한 작품의 예약이 열리기 전에 여기로 알려드려요.</p><a class="btn ghost sm" href="#/alerts">알림 설정 보기</a></div>';
    }
    h += '<div class="list">' + S.inbox.slice().reverse().map(function (n) {
      var e = EV[n.eventId], ip = e ? IP[e.ip] : null, d = new Date(n.at);
      var when = sameDay(d, new Date()) ? '오늘 ' + fmtTime(d) : fmtDate(d) + ' ' + fmtTime(d);
      return '<button class="row" data-action="openEvent" data-id="' + esc(n.eventId) + '"' + (e ? '' : ' disabled') + '>' + (ip ? avatar(ip) : '') +
        '<span class="body"><span class="s">' + when + (n.at > S.seenAt ? ' · <b style="color:var(--accent)">새 알림</b>' : '') + '</span><br><span class="t">' + esc(n.title) + '</span><br><span class="s">' + esc(n.body) + '</span></span>' + ic('next', 18) + '</button>';
    }).join('') + '</div>';
    h += '<div class="sec"><button class="btn line block sm" style="margin-top:14px" data-action="inboxClear">알림 기록 지우기</button></div>';
    return h;
  }

  /* ───────── 마이페이지 ───────── */
  function viewMy() {
    var now = Date.now();
    var pending = myEvents().filter(function (e) { return e.t > now && eventAlertOn(e); }).length;
    var h = '<header class="hdr"><h1>마이페이지</h1></header>';
    h += '<div class="profile"><span class="ph">' + ic('user', 30) + '</span>';
    if (ui.editName) {
      h += '<form data-form="name"><label class="sr" for="nick">닉네임</label><input id="nick" maxlength="12" value="' + esc(S.nickname) + '"><button class="btn primary sm">저장</button></form>';
    } else {
      h += '<div style="flex:1;min-width:0"><div class="nm">' + esc(S.nickname) + '</div><div class="muted" style="font-size:13px">이 기기에 저장된 덕질 정보</div></div>' +
        '<button class="btn line sm" data-action="editName">' + ic('pen', 16) + '수정</button>';
    }
    h += '</div>';
    h += '<div class="stats"><a href="#/subs"><b>' + S.subs.length + '</b><span>구독 IP</span></a><a href="#/calendar"><b>' + pending + '</b><span>예정 알림</span></a><a href="#/inbox"><b>' + S.inbox.length + '</b><span>받은 알림</span></a></div>';
    h += '<div class="divider" style="margin-top:18px"></div><div class="label" style="padding-top:12px">덕질 관리</div>';
    h += menu('#/subs', 'heart', '구독 관리', S.subs.length + '개');
    h += menu('#/alerts', 'bell', '알림 설정', S.master ? S.timings.map(function (t) { return TIMINGS.filter(function (x) { return x[0] === t; })[0][1]; }).join('·') : '꺼짐');
    h += menu('#/inbox', 'clock', '알림 기록', unread() ? '새 알림 ' + unread() + '개' : '');
    h += menu('#/onboarding', 'plus', '관심 작품 다시 고르기', '');
    h += '<div class="label">기타</div>';
    h += '<a class="menu-row" href="mailto:?subject=' + encodeURIComponent('[덕후브] 작품 추가 요청') + '&body=' + encodeURIComponent('추가하고 싶은 작품 이름: ') + '">' + ic('info', 20) + '<span class="grow">작품 추가 요청</span>' + ic('next', 18) + '</a>';
    h += '<button class="menu-row" data-action="reset">' + ic('trash', 20) + '<span class="grow">' + (ui.resetArm ? '한 번 더 누르면 모든 정보가 지워져요' : '이 기기의 덕질 정보 초기화') + '</span></button>';
    h += '<p class="note">덕후브 v0.1 (MVP) · 현재 일정은 화면 시연용 예시 데이터예요.</p>';
    return h;
  }
  function menu(href, icon, label, val) {
    return '<a class="menu-row" href="' + href + '">' + ic(icon, 20) + '<span class="grow">' + label + '</span><span class="val">' + esc(val) + '</span>' + ic('next', 18) + '</a>';
  }

  /* ───────── 일정 상세 시트 ───────── */
  function openSheet(id) {
    var e = EV[id]; if (!e) return;
    ui.sheet = id;
    var ip = IP[e.ip], dd = dday(e), past = e.t < Date.now(), sub = isSub(e.ip);
    var muted = !!S.eventMute[e.id];
    var h = '<div class="scrim" data-action="closeSheet"></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<div class="grab"></div><div class="top">' + avatar(ip) + '<div class="grow"><div style="font-weight:800">' + esc(ip.name) + '</div><div class="muted" style="font-size:13px">' + CAT[ip.cat] + ' · <span class="kind ' + e.kind + '">' + KIND[e.kind] + '</span></div></div>' +
      '<span class="tag ' + dd.cls + '">' + dd.label + '</span><button class="icon-btn" data-action="closeSheet" aria-label="닫기">' + ic('x') + '</button></div>' +
      '<h2 id="sheet-title">' + esc(e.title) + '</h2>' +
      (past ? '' : '<div class="count"><span class="muted">' + VERB[e.kind] + '까지 남은 시간</span><b data-countdown="' + e.t.getTime() + '">' + fmtRemain(e.t - Date.now()) + '</b></div>') +
      '<dl><dt>' + VERB[e.kind] + ' 일시</dt><dd>' + fmtDate(e.t) + ' ' + fmtTime(e.t) + '</dd>' +
      '<dt>예약 채널</dt><dd>' + esc(e.channel) + '</dd>' +
      (e.note ? '<dt>안내</dt><dd style="font-weight:500">' + esc(e.note) + '</dd>' : '') +
      '<dt>알림</dt><dd>' + (!sub ? '구독하면 받을 수 있어요' : (eventAlertOn(e) ? S.timings.map(function (t) { return TIMINGS.filter(function (x) { return x[0] === t; })[0][1]; }).join(' · ') : '꺼짐')) + '</dd></dl>' +
      '<div class="actions">' +
      (e.url ? '<a class="btn primary block" href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.channel) + ' 바로가기' + ic('ext', 18) + '</a>' : '') +
      '<div class="two">' +
      (sub
        ? '<button class="btn line sm" data-action="eventMute" data-id="' + e.id + '">' + ic(muted ? 'bell' : 'bellOff', 18) + (muted ? '이 일정 알림 켜기' : '이 일정 알림 끄기') + '</button>'
        : '<button class="btn pink sm" data-action="toggleSub" data-id="' + ip.id + '">' + ic('heart', 18) + esc(ip.name) + ' 구독</button>') +
      '<button class="btn line sm" data-action="ics" data-id="' + e.id + '">' + ic('download', 18) + '내 캘린더에 추가</button></div></div></div>';
    document.getElementById('sheet').innerHTML = h;
    var closeBtn = document.querySelector('#sheet .panel .icon-btn');
    if (closeBtn) closeBtn.focus();
  }
  function closeSheet() {
    ui.sheet = null;
    document.getElementById('sheet').innerHTML = '';
  }

  /* .ics 파일로 휴대폰·구글 캘린더에 추가 */
  function downloadIcs(e) {
    function stamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    var end = new Date(e.t.getTime() + 30 * 60000);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DukHub//KO', 'BEGIN:VEVENT',
      'UID:' + e.id + '@dukhub', 'DTSTAMP:' + stamp(new Date()), 'DTSTART:' + stamp(e.t), 'DTEND:' + stamp(end),
      'SUMMARY:[' + IP[e.ip].name + '] ' + e.title, 'DESCRIPTION:' + e.channel + (e.url ? ' ' + e.url : ''),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + e.title, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'dukhub-' + e.id + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ───────── 알림 ───────── */
  function toast(title, body, eventId) {
    var box = document.getElementById('toast');
    var el = document.createElement('button');
    el.className = 't';
    el.innerHTML = '<img src="icons/icon-192.png" alt=""><span class="b"><span class="h">' + esc(title) + '</span><br><span class="d">' + esc(body) + '</span></span>';
    el.addEventListener('click', function () { el.remove(); if (eventId && EV[eventId]) openSheet(eventId); });
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }
  function deviceNotify(title, body, e, tag) {
    if (permState() !== 'granted') return;
    var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: e ? e.url : './', eventId: e ? e.id : null } };
    if (swReg && swReg.showNotification) { swReg.showNotification(title, opts).catch(function () {}); return; }
    try {
      var n = new Notification(title, opts);
      n.onclick = function () { window.focus(); if (e) openSheet(e.id); };
    } catch (err) { /* 일부 모바일 브라우저는 서비스 워커로만 알림 가능 */ }
  }
  function fire(e, tk) {
    var ip = IP[e.ip];
    var title = tk === '0m' ? '지금 ' + VERB[e.kind] + '! ' + ip.name : (TIMINGS.filter(function (x) { return x[0] === tk; })[0][1] + ' ' + KIND[e.kind] + ' · ' + ip.name);
    var body = e.title + ' · ' + fmtTime(e.t) + ' ' + e.channel + (tk === '0m' ? '' : ' (누르면 바로 이동)');
    S.inbox.push({ eventId: e.id, title: title, body: body, at: Date.now() });
    if (S.inbox.length > 100) S.inbox = S.inbox.slice(-100);
    toast(title, body, e.id);
    deviceNotify(title, body, e, e.id + '|' + tk);
  }
  function tick() {
    if (!S.onboarded || !S.master) return;
    var now = Date.now(), hour = new Date().getHours(), changed = false;
    EVENTS.forEach(function (e) {
      if (!isSub(e.ip) || !eventAlertOn(e)) return;
      S.timings.forEach(function (tk) {
        var at = e.t.getTime() - TMIN[tk] * 60000;
        var key = e.id + '|' + e.at + '|' + tk;
        if (S.notified[key] || now < at || now - at > 15 * 60000) return;
        S.notified[key] = now; changed = true;
        if (S.dnd && hour >= 1 && hour < 8 && e.kind !== 'open') return;
        fire(e, tk);
      });
    });
    if (changed) {
      save();
      var r = parse().name;
      if (r === 'home' || r === 'inbox' || (r === 'my' && !ui.editName)) render();
    }
  }
  function pruneNotified() {
    var lim = Date.now() - 40 * 86400000;
    Object.keys(S.notified).forEach(function (k) { if (S.notified[k] < lim) delete S.notified[k]; });
  }

  function tickCountdowns() {
    var now = Date.now();
    var els = document.querySelectorAll('[data-countdown]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = fmtRemain(+els[i].getAttribute('data-countdown') - now);
    }
  }

  /* ───────── 동작 ───────── */
  function toggleSub(id) {
    var i = S.subs.indexOf(id);
    if (i === -1) {
      S.subs.push(id);
      if (ui.q.trim()) addRecent(ui.q.trim());
    } else S.subs.splice(i, 1);
    save();
  }
  function addRecent(q) {
    S.recent = [q].concat(S.recent.filter(function (r) { return r !== q; })).slice(0, 8);
    save();
  }

  var ACTIONS = {
    back: function () { if (history.length > 1) history.back(); else location.hash = '#/home'; },
    onbCat: function (el) { ui.onbCat = el.dataset.v; render(); },
    onbPick: function (el) {
      var id = el.dataset.id, i = ui.onbPick.indexOf(id);
      if (i === -1) ui.onbPick.push(id); else ui.onbPick.splice(i, 1);
      render();
    },
    onbDone: function () {
      if (!ui.onbPick.length) return;
      S.subs = ui.onbPick.slice();
      S.onboarded = true; save();
      ui.onbPick = [];
      location.hash = '#/home';
      tick();
    },
    homeIp: function (el) { ui.homeIp = el.dataset.id || null; render(); },
    openEvent: function (el) { openSheet(el.dataset.id); },
    closeSheet: closeSheet,
    toggleSub: function (el) {
      toggleSub(el.dataset.id);
      if (ui.sheet) openSheet(ui.sheet);
      if (parse().name === 'search') { document.getElementById('results').innerHTML = searchResults(); }
      else render();
    },
    ipMute: function (el) { var id = el.dataset.id; S.ipMute[id] = !S.ipMute[id]; if (!S.ipMute[id]) delete S.ipMute[id]; save(); render(); },
    eventMute: function (el) { var id = el.dataset.id; if (S.eventMute[id]) delete S.eventMute[id]; else S.eventMute[id] = true; save(); openSheet(id); render(); },
    ics: function (el) { downloadIcs(EV[el.dataset.id]); },
    calMove: function (el) { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + (+el.dataset.v), 1); render(); },
    calDay: function (el) { ui.cal = new Date(+el.dataset.v); render(); },
    calKind: function (el) { ui.calKind = el.dataset.v; render(); },
    calScope: function () { ui.calScope = ui.calScope === 'subs' ? 'all' : 'subs'; render(); },
    cat: function (el) { ui.cat = el.dataset.v; render(); },
    clearQ: function () { ui.q = ''; render(); var q = document.getElementById('q'); if (q) q.focus(); },
    recentPick: function (el) { ui.q = el.dataset.v; render(); },
    recentDel: function (el) { S.recent.splice(+el.dataset.i, 1); save(); document.getElementById('results').innerHTML = searchResults(); },
    recentClear: function () { S.recent = []; save(); document.getElementById('results').innerHTML = searchResults(); },
    subsSort: function (el) { ui.subsSort = el.dataset.v; render(); },
    master: function () { S.master = !S.master; save(); render(); },
    timing: function (el) {
      var v = el.dataset.v, i = S.timings.indexOf(v);
      if (i === -1) S.timings.push(v);
      else if (S.timings.length > 1) S.timings.splice(i, 1);
      else { toast('알림 시점은 1개 이상 필요해요', '다른 시점을 먼저 켠 뒤 꺼 주세요.'); return; }
      S.timings.sort(function (a, b) { return TMIN[b] - TMIN[a]; });
      save(); render();
    },
    kind: function (el) { var k = el.dataset.v; S.kinds[k] = !S.kinds[k]; save(); render(); },
    dnd: function () { S.dnd = !S.dnd; save(); render(); },
    perm: function () {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(function () { render(); });
    },
    test: function () {
      var e = myEvents().filter(function (x) { return x.t > Date.now(); })[0] || EVENTS.filter(function (x) { return x.t > Date.now(); })[0];
      if (!e) return;
      var title = '30분 전 ' + KIND[e.kind] + ' · ' + IP[e.ip].name;
      var body = e.title + ' · ' + fmtTime(e.t) + ' ' + e.channel + ' (테스트 알림)';
      toast(title, body, e.id);
      deviceNotify(title, body, e, 'test');
    },
    inboxClear: function () { S.inbox = []; save(); render(); },
    editName: function () { ui.editName = true; render(); var n = document.getElementById('nick'); if (n) { n.focus(); n.select(); } },
    reset: function () {
      if (!ui.resetArm) { ui.resetArm = true; render(); setTimeout(function () { ui.resetArm = false; if (parse().name === 'my') render(); }, 4000); return; }
      try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
      S = clone(DEFAULTS); ui.resetArm = false; ui.onbPick = [];
      location.hash = '#/onboarding'; render();
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = ACTIONS[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.dataset.form === 'search') {
      ev.preventDefault();
      var q = document.getElementById('q').value.trim();
      if (q) addRecent(q);
      document.getElementById('q').blur();
    } else if (f.dataset.form === 'name') {
      ev.preventDefault();
      var v = document.getElementById('nick').value.trim();
      if (v) S.nickname = v.slice(0, 12);
      ui.editName = false; save(); render();
    }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') {
      ui.q = ev.target.value;
      document.getElementById('results').innerHTML = searchResults();
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ui.sheet) closeSheet();
  });
  window.addEventListener('hashchange', function () { closeSheet(); render(); });
  window.addEventListener('storage', function (ev) { if (ev.key === KEY) { S = load(); render(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  /* ───────── 시작 ───────── */
  var swReg = null;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(function (reg) { swReg = reg; }).catch(function () {});
  }
  pruneNotified();
  save();
  render();
  tick();
  setInterval(tick, 20000);
  setInterval(tickCountdowns, 1000);
})();
