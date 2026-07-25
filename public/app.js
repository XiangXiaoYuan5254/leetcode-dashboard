'use strict';

/* ================= 全局状态 ================= */

const state = {
  submissions: [],   // {id, slug, title, status, lang, ts}
  problems: {},      // slug -> {frontendId, title, translatedTitle, difficulty, tags}
  plans: [],         // [{slug, name, questionNum, groups:[{name, questionNum, questions}]}]
  year: 'all',       // 'all' 或数字年份
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calView: 'year',   // 'year' | 'month'
  demoMode: false,
  charts: {},
  tableSort: { key: 'count', desc: true },
  tableRows: [],
};

const $ = (sel) => document.querySelector(sel);
const DIFF_NAME = { Easy: '简单', Medium: '中等', Hard: '困难', Unknown: '未知' };
const cssv = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function isAccepted(s) { return s.status === 'Accepted' || s.status === '通过'; }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function dayKeyOf(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 提交里的 slug 可能未解析（null），用标题构造稳定 key 保证仍被统计
function keyOf(s) { return s.slug || 't:' + s.title; }
function problemOf(key) {
  return state.problems[key] || { frontendId: '', translatedTitle: key.startsWith('t:') ? key.slice(2) : key, difficulty: 'Unknown', tags: [] };
}

/* ================= 统计计算 ================= */

// “完成”事件：AC 提交按 (题目, 日期) 去重，同题同日多次提交只算一次
function buildSolveEvents(submissions) {
  const seen = new Set();
  const events = [];
  for (const s of submissions) {
    if (!isAccepted(s) || !s.ts) continue;
    const k = keyOf(s);
    const day = dayKeyOf(s.ts);
    const dedup = k + '|' + day;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    events.push({ key: k, day, ts: s.ts, year: Number(day.slice(0, 4)), title: s.title });
  }
  return events;
}

function computeStats(year) {
  const allEvents = buildSolveEvents(state.submissions);

  // 每题历史首次完成（用于区分“新题”与“复习”）
  const firstSolve = new Map();
  for (const e of allEvents) {
    const cur = firstSolve.get(e.key);
    if (cur === undefined || e.ts < cur.ts) firstSolve.set(e.key, { ts: e.ts, year: e.year });
  }

  const inYear = (y) => year === 'all' || y === year;
  const events = allEvents.filter((e) => inYear(e.year));

  const uniqueKeys = new Set(events.map((e) => e.key));
  let newCount = 0;
  for (const k of uniqueKeys) {
    const first = firstSolve.get(k);
    if (year === 'all' || (first && first.year === year)) newCount++;
  }

  // 每日（含当天题目 key 列表，供日历 tooltip）/ 每月
  const perDay = new Map(); // day -> [key, ...]
  const perMonth = new Map(); // 'YYYY-MM' -> {solves, keys:Set}
  for (const e of events) {
    if (!perDay.has(e.day)) perDay.set(e.day, []);
    perDay.get(e.day).push(e.key);
    const mk = e.day.slice(0, 7);
    if (!perMonth.has(mk)) perMonth.set(mk, { solves: 0, keys: new Set() });
    const m = perMonth.get(mk);
    m.solves++; m.keys.add(e.key);
  }

  // 每题完成次数
  const perProblem = new Map();
  for (const e of events) {
    if (!perProblem.has(e.key)) perProblem.set(e.key, { count: 0, lastDay: '', title: e.title });
    const p = perProblem.get(e.key);
    p.count++;
    if (e.day > p.lastDay) p.lastDay = e.day;
  }

  // 难度 / 题型（按独立题目去重）
  const byDifficulty = {};
  const byTag = new Map();
  for (const k of uniqueKeys) {
    const q = problemOf(k);
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
    for (const t of q.tags || []) {
      byTag.set(t.translatedName, (byTag.get(t.translatedName) || 0) + 1);
    }
  }

  // 提交计数（原始提交，不去重；无题单时首页大环回退显示通过率用）
  let totalSubs = 0, acSubs = 0;
  for (const s of state.submissions) {
    if (!s.ts) continue;
    const y = new Date(s.ts * 1000).getFullYear();
    if (!inYear(y)) continue;
    totalSubs++;
    if (isAccepted(s)) acSubs++;
  }

  // 连续打卡
  const days = [...perDay.keys()].sort();
  let longest = 0, cur = 0, prev = null;
  for (const d of days) {
    if (prev !== null && (new Date(d) - new Date(prev)) === 86400000) cur++;
    else cur = 1;
    if (cur > longest) longest = cur;
    prev = d;
  }
  const daySet = new Set(days);
  let current = 0;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const cursor = new Date(today);
  if (!daySet.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const k = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`;
    if (daySet.has(k)) { current++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }

  return {
    events, uniqueCount: uniqueKeys.size, newCount, reviewCount: uniqueKeys.size - newCount,
    totalSolves: events.length, perDay, perMonth, perProblem,
    byDifficulty, byTag, totalSubs, acSubs,
    activeDays: days.length, longestStreak: longest, currentStreak: current,
    allYears: [...new Set(allEvents.map((e) => e.year))].sort((a, b) => b - a),
    allSolved: new Set(allEvents.map((e) => e.key)), // 全部年份 AC 过的题（题单进度用）
    allSolvedTs: (() => { // key -> [AC 时间戳(秒)]，供“重刷”按时间点筛选
      const m = new Map();
      for (const e of allEvents) {
        if (!m.has(e.key)) m.set(e.key, []);
        m.get(e.key).push(e.ts);
      }
      return m;
    })(),
    allPerDay: (() => { // 全量每日数据（题目 key），供日历跨年浏览
      const m = new Map();
      for (const e of allEvents) {
        if (!m.has(e.day)) m.set(e.day, []);
        m.get(e.day).push(e.key);
      }
      return m;
    })(),
  };
}

/* ================= 渲染 ================= */

let lastStats = null;

function render() {
  const stats = computeStats(state.year);
  lastStats = stats;
  renderYearSelector(stats.allYears);
  renderHero(stats);
  renderCalendar(stats);
  renderPlans(stats);
  renderDifficulty(stats);
  renderTags(stats);
  renderMonth(stats);
  renderTable(stats);
}

function renderYearSelector(years) {
  const sel = $('#yearSel');
  const currentVal = String(state.year);
  sel.innerHTML = ['<option value="all">全部年份</option>']
    .concat(years.map((y) => `<option value="${y}">${y} 年</option>`)).join('');
  sel.value = [...sel.options].some((o) => o.value === currentVal) ? currentVal : 'all';
}

function yearLabel() { return state.year === 'all' ? '累计' : state.year === new Date().getFullYear() ? '今年' : state.year + ' 年'; }

/* ---------- 首屏 ---------- */

// 重刷：题单的当前轮次以最后一次重刷时间点为分界，之前的完成不计入本轮
function planCutoff(p) {
  const r = p.restarts || [];
  return r.length ? r[r.length - 1] : 0; // 毫秒；0 = 从头计
}
function planRound(p) { return (p.restarts || []).length + 1; }

// 某题在 cutoff（毫秒）之后是否被 AC 过；cutoff=0 表示只要历史上做过即可
function solvedSince(solvedTsByKey, slug, cutoff) {
  const arr = solvedTsByKey.get(slug);
  if (!arr) return false;
  if (!cutoff) return true;
  return arr.some((ts) => ts * 1000 >= cutoff);
}

// 题单进度（只统计接口可见的题目；会员锁定章节不计入；按当前轮次的 cutoff 计）
function planProgress(p, solvedTsByKey, cutoff) {
  let done = 0, total = 0;
  const seen = new Set();
  for (const g of p.groups) {
    if (g.questions.length === 0 && g.questionNum > 0) continue; // 🔒 会员章节
    for (const q of g.questions) {
      if (q.trackable === false || seen.has(q.slug)) continue;
      seen.add(q.slug);
      total++;
      if (solvedSince(solvedTsByKey, q.slug, cutoff)) done++;
    }
  }
  return { done, total, pct: total ? done / total : 0 };
}

// 题单整体折叠状态（本地记忆）
function collapsedPlans() {
  try { return new Set(JSON.parse(localStorage.getItem('lc-plan-collapsed') || '[]')); } catch (e) { return new Set(); }
}
function setPlanCollapsed(slug, collapsed) {
  const set = collapsedPlans();
  if (collapsed) set.add(slug); else set.delete(slug);
  try { localStorage.setItem('lc-plan-collapsed', JSON.stringify([...set])); } catch (e) { /* ignore */ }
}

function primaryPlan() {
  let slug = null;
  try { slug = localStorage.getItem('lc-primary-plan'); } catch (e) { /* ignore */ }
  return state.plans.find((p) => p.slug === slug) || state.plans[0] || null;
}

function renderHero(s) {
  // 首页大环：优先展示“主题单”的完成进度，没有题单时退回提交通过率
  const plan = state.demoMode ? null : primaryPlan();
  let rate, pctText, fracText, label;
  if (plan) {
    const pr = planProgress(plan, s.allSolvedTs, planCutoff(plan));
    const round = planRound(plan);
    rate = pr.pct;
    pctText = Math.round(pr.pct * 100) + '%';
    fracText = `已完成 ${pr.done} / ${pr.total} 题`;
    label = `「${plan.name}」进度${round > 1 ? ` · 第 ${round} 轮` : ''}`;
  } else {
    rate = s.totalSubs ? s.acSubs / s.totalSubs : 0;
    pctText = Math.round(rate * 100) + '%';
    fracText = `通过 ${s.acSubs} / 提交 ${s.totalSubs}`;
    label = `${yearLabel()}提交通过率`;
  }
  const R = 84, C = 2 * Math.PI * R;
  $('#ringCard').innerHTML = `
    <div class="ring-wrap">
      <svg width="190" height="190" viewBox="0 0 190 190">
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${cssv('--heat')}"/><stop offset="100%" stop-color="${cssv('--heat2')}"/>
        </linearGradient></defs>
        <circle class="ring-track" cx="95" cy="95" r="${R}" fill="none" stroke-width="13"/>
        <circle class="ring-val" cx="95" cy="95" r="${R}" fill="none" stroke-width="13" stroke-linecap="round"
          transform="rotate(-90 95 95)" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg>
      <div class="ring-center">
        <span class="pct num-font">${pctText}</span>
        <span class="frac num-font">${fracText}</span>
      </div>
    </div>
    <span class="ring-label">${escapeHtml(label)}${plan ? '<br><span class="ring-hint">在题单卡片上点 ★ 可切换首页展示的题单</span>' : ''}</span>`;
  requestAnimationFrame(() => {
    const el = document.querySelector('.ring-val');
    if (el) el.style.strokeDashoffset = String(C * (1 - rate));
  });

  const topTag = [...s.byTag.entries()].sort((a, b) => b[1] - a[1])[0];
  const avg = s.activeDays ? (s.totalSolves / s.activeDays).toFixed(1) : '0';
  const kpis = [
    { cap: `${yearLabel()}做了多少不重复的题`, num: `${s.uniqueCount}<small>题</small>`, glow: 'var(--heat)', color: 'var(--heat)',
      meta: state.year === 'all' ? `全部去重后的题目数` : `新题 ${s.newCount} · 复习旧题 ${s.reviewCount}` },
    { cap: `${yearLabel()}一共做了多少题`, num: `${s.totalSolves}<small>题</small>`, glow: 'var(--c1)', color: 'var(--c1)', meta: '同题同日多次提交计 1 次' },
    { cap: '活跃天数', num: `${s.activeDays}<small>天</small>`, glow: 'var(--easy)', color: 'var(--easy)', meta: `活跃日均 ${avg} 题` },
    { cap: '最长连续打卡', num: `${s.longestStreak}<small>天</small>`, glow: 'var(--c6)', color: 'var(--c6)', meta: `当前连续 ${s.currentStreak} 天` },
    { cap: '刷过最多的题', num: '', glow: 'var(--c4)', color: 'var(--c4)', meta: '' },
    { cap: '最常刷题型', num: `<span class="num txt" style="margin:0">${topTag ? escapeHtml(topTag[0]) : '—'}</span>`, glow: 'var(--c3)', color: 'var(--c3)',
      meta: topTag ? `${topTag[1]} 题` : '', isText: true },
  ];
  // “刷过最多的题”
  const most = [...s.perProblem.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (most) {
    const q = problemOf(most[0]);
    kpis[4].num = `<span class="num txt" style="margin:0">${escapeHtml(q.translatedTitle || most[1].title)}</span>`;
    kpis[4].meta = `完成 ${most[1].count} 次`;
    kpis[4].isText = true;
  } else {
    kpis[4].num = '—';
  }
  $('#kpis').innerHTML = kpis.map((k) => `
    <div class="card kpi">
      <div class="glow" style="background:${k.glow}"></div>
      <div class="cap">${k.cap}</div>
      <div class="num" style="color:${k.color}">${k.num}</div>
      <div class="meta">${k.meta}</div>
    </div>`).join('');
}

/* ---------- 年历墙 ---------- */

function renderCalendar(s) {
  const byDate = s.allPerDay;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const thisYear = today.getFullYear();
  const years = new Set([thisYear, ...s.allYears]);
  const minY = Math.min(...years), maxY = Math.max(...years);
  if (state.calYear < minY) state.calYear = minY;
  if (state.calYear > maxY) state.calYear = maxY;
  const Y = state.calYear;
  const isMonthView = state.calView === 'month';

  let solved = 0, days = 0, best = { n: 0, date: '' };
  const lvlOf = (n) => n === 0 ? 0 : n === 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : 4;
  const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
  const dimOf = (m) => new Date(Y, m + 1, 0).getDate();
  const leadOf = (m) => (new Date(Y, m, 1).getDay() + 6) % 7;
  const stat = (key, n) => { if (n) { solved += n; days++; if (n > best.n) best = { n, date: key }; } };

  // 每题一行、带题号（.tip 样式 white-space:pre-line 按 \n 换行）
  const labelOf = (k) => {
    const q = problemOf(k);
    return (q.frontendId ? q.frontendId + '. ' : '') + (q.translatedTitle || k);
  };
  const tipOf = (key, list, isToday, fut) => {
    const n = list.length;
    if (!n) {
      if (isToday) return ` data-tip="今天 · ${key} · 还没刷题哦"`;
      return fut ? '' : ` data-tip="${key} · 没有刷题"`;
    }
    const lines = list.slice(0, 12).map(labelOf);
    const text = `${isToday ? '今天 · ' : ''}${key} · 完成 ${n} 题\n` +
      lines.join('\n') + (n > 12 ? `\n… 还有 ${n - 12} 题` : '');
    return ` data-tip="${escapeHtml(text)}"`;
  };

  const smallMonth = (m) => {
    let cells = '', mSum = 0;
    for (let i = 0; i < leadOf(m); i++) cells += '<span class="mc-cell blank"></span>';
    for (let day = 1; day <= dimOf(m); day++) {
      const dt = new Date(Y, m, day, 12);
      const key = `${Y}-${pad2(m + 1)}-${pad2(day)}`;
      const list = byDate.get(key) || [];
      const n = list.length, isToday = key === todayKey;
      stat(key, n); mSum += n;
      const lvl = lvlOf(n);
      const cls = 'mc-cell' + (lvl ? ` l${lvl} solved` : '') + (dt > today ? ' fut' : '') + (isToday ? ' today' : '');
      cells += `<span class="${cls}"${tipOf(key, list, isToday, dt > today)}>${day}</span>`;
    }
    return `<div class="mcal${Y === thisYear && m === today.getMonth() ? ' cur' : ''}">
      <div class="mc-head"><b>${m + 1} 月</b>${mSum ? `<span class="mc-sum">${mSum} 题</span>` : ''}</div>
      <div class="mc-week">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="mc-grid">${cells}</div></div>`;
  };

  const bigMonth = (m) => {
    let cells = '';
    for (let i = 0; i < leadOf(m); i++) cells += '<div class="bmc blank"></div>';
    for (let day = 1; day <= dimOf(m); day++) {
      const dt = new Date(Y, m, day, 12);
      const key = `${Y}-${pad2(m + 1)}-${pad2(day)}`;
      const list = byDate.get(key) || [];
      const n = list.length, isToday = key === todayKey;
      stat(key, n);
      const lvl = lvlOf(n);
      const chips = list.slice(0, 3).map((k) => `<span class="bmc-chip">${escapeHtml(labelOf(k))}</span>`).join('');
      const more = n > 3 ? `<span class="bmc-more">还有 ${n - 3} 题…</span>` : '';
      cells += `<div class="bmc${lvl ? ' l' + lvl : ''}${dt > today ? ' fut' : ''}${isToday ? ' today' : ''}"${tipOf(key, list, isToday, dt > today)}>
        <span class="bmc-d">${day}</span>${chips}${more}</div>`;
    }
    return `<div class="bmc-week">${WEEK.map((w) => `<span>周${w}</span>`).join('')}</div><div class="bmc-grid">${cells}</div>`;
  };

  $('#calBody').innerHTML = isMonthView
    ? bigMonth(state.calMonth)
    : `<div class="mcal-grid">${[...Array(12)].map((_, m) => smallMonth(m)).join('')}</div>`;
  $('#calYearLabel').textContent = isMonthView ? `${Y} 年 ${state.calMonth + 1} 月` : `${Y} 年`;
  $('#calPrev').disabled = isMonthView ? (Y <= minY && state.calMonth <= 0) : Y <= minY;
  $('#calNext').disabled = isMonthView ? (Y >= maxY && state.calMonth >= 11) : Y >= maxY;
  const range = isMonthView ? `${Y} 年 ${state.calMonth + 1} 月` : `${Y} 年`;
  $('#calSummary').innerHTML = `${range}共完成 <b>${solved}</b> 次 · 有刷题的天数 <b>${days}</b> 天` +
    (best.n ? ` · 单日最多 ${best.n} 题（${best.date}）` : '');
  const mix = (n) => `color-mix(in srgb,var(--heat) ${n}%,transparent)`;
  $('#calScale').innerHTML = `少 <i style="background:var(--track)"></i><i style="background:${mix(28)}"></i><i style="background:${mix(52)}"></i><i style="background:${mix(78)}"></i><i style="background:var(--heat)"></i> 多`;
}

function calStep(dir) {
  if (state.calView === 'month') {
    state.calMonth += dir;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  } else {
    state.calYear += dir;
  }
  if (lastStats) renderCalendar(lastStats);
}

/* ---------- 题单进度 ---------- */

function renderPlans(s) {
  const section = $('#plansSection');
  if (state.demoMode) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const grid = $('#plansGrid');
  if (!state.plans.length) {
    grid.innerHTML = `<div class="card plan-empty">还没有题单 —— 点右上角「＋ 添加题单」，同步后自动跟踪进度</div>`;
    return;
  }
  const primary = primaryPlan();
  const collapsed = collapsedPlans();
  grid.innerHTML = state.plans.map((p) => {
    const cutoff = planCutoff(p);
    const round = planRound(p);
    const isCollapsed = collapsed.has(p.slug);
    const difficultyBySlug = new Map(
      p.groups.flatMap((group) => group.questions.map((q) => [q.slug, q.difficulty]))
    );
    // 会员锁定章节（接口读不到题目）不展示；内置课程可用 lessons 展示逐期视频
    const groupRows = p.groups.filter((g) => g.questions.length > 0 || (g.lessons || []).length > 0).map((g) => {
      const questions = g.questions.filter((q) => q.trackable !== false);
      const lessons = g.lessons || [];
      const gDone = questions.filter((q) => solvedSince(s.allSolvedTs, q.slug, cutoff)).length;
      const total = questions.length;
      const pct = total ? Math.round((gDone / total) * 100) : 0;
      // 代码随想录按 B 站合集逐期展示；普通官方题单仍按题目展示
      const lessonRows = lessons.map((lesson) => {
        const exact = (lesson.questionSlugs || []).map((slug) => {
          const info = problemOf(slug);
          const solved = solvedSince(s.allSolvedTs, slug, cutoff);
          const id = info.frontendId || slug;
          const difficulty = difficultyBySlug.get(slug) || info.difficulty || 'Unknown';
          return `<span class="lesson-question">
            <a class="lesson-q${solved ? ' solved' : ''}" href="https://leetcode.cn/problems/${slug}/" target="_blank" title="${escapeHtml(info.translatedTitle || slug)}">${solved ? '✓ ' : ''}LC ${escapeHtml(id)}</a>
            <span class="diff ${difficulty}">${DIFF_NAME[difficulty] || difficulty}</span>
          </span>`;
        }).join('');
        const related = (lesson.relatedQuestionSlugs || []).map((slug) => {
          const info = problemOf(slug);
          const id = info.frontendId || slug;
          const difficulty = difficultyBySlug.get(slug) || info.difficulty || 'Unknown';
          return `<span class="lesson-question">
            <a class="lesson-q related" href="https://leetcode.cn/problems/${slug}/" target="_blank" title="同类力扣题：${escapeHtml(info.translatedTitle || slug)}">同类 LC ${escapeHtml(id)}</a>
            <span class="diff ${difficulty}">${DIFF_NAME[difficulty] || difficulty}</span>
          </span>`;
        }).join('');
        const exactSlugs = lesson.questionSlugs || [];
        const solved = exactSlugs.length > 0 && exactSlugs.every((slug) => solvedSince(s.allSolvedTs, slug, cutoff));
        const kind = !exact && !related ? '<span class="lesson-kind">课程</span>' : '';
        return `<div class="pq lesson-row${solved ? ' solved' : ''}">
          <i>${solved ? '✓' : '▶'}</i>
          <a class="pq-t lesson-video" href="${escapeHtml(lesson.videoUrl)}" target="_blank">${lesson.index}. ${escapeHtml(lesson.title)}</a>
          <span class="lesson-links">${exact}${related}${kind}</span>
        </div>`;
      }).join('');
      const questionRows = g.questions.map((q) => {
        const info = problemOf(q.slug);
        const solved = solvedSince(s.allSolvedTs, q.slug, cutoff);
        const title = (info.frontendId ? info.frontendId + '. ' : '') + (info.translatedTitle || q.slug);
        return `<a class="pq${solved ? ' solved' : ''}" href="https://leetcode.cn/problems/${q.slug}/" target="_blank">
          <i>${solved ? '✓' : ''}</i>
          <span class="pq-t">${escapeHtml(title)}</span>
          <span class="diff ${q.difficulty}">${DIFF_NAME[q.difficulty] || q.difficulty}</span></a>`;
      }).join('');
      const detailRows = lessons.length ? lessonRows : questionRows;
      const frac = total
        ? `${gDone} / ${total}${g.videoCount ? ` · ${g.videoCount}期` : ''}`
        : `${g.videoCount || lessons.length} 期`;
      return `<div class="pg-row clickable${gDone === total && total > 0 ? ' done' : ''}${total === 0 ? ' course' : ''}">
        <span class="chev">▸</span>
        <span class="pg-name" title="${escapeHtml(g.name)}">${gDone === total && total > 0 ? '✓ ' : ''}${escapeHtml(g.name)}</span>
        <span class="pg-bar"><i style="width:${pct}%"></i></span>
        <span class="pg-frac">${frac}</span></div>
      <div class="pg-questions">${detailRows}</div>`;
    }).join('');
    const pr = planProgress(p, s.allSolvedTs, cutoff);
    const pct = Math.round(pr.pct * 100);
    const isPrimary = primary && primary.slug === p.slug;
    const roundBadge = round > 1
      ? `<span class="plan-round" title="自 ${new Date(cutoff).toLocaleDateString('zh-CN')} 起重新计数">第 ${round} 轮 · ${new Date(cutoff).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 起<button class="round-undo" data-slug="${p.slug}" title="撤销本次重刷，回到上一轮">撤销</button></span>`
      : '';
    const sourceStats = p.sourceStats
      ? `<div class="plan-source-note">合集 ${p.sourceStats.videoCount} 期 = ${p.sourceStats.problemVideoCount} 期力扣题相关视频 + ${p.sourceStats.basicTheoryOrSummaryVideoCount} 期基础理论/总结 + ${p.sourceStats.graphVideoCount} 期图论（卡码网 ACM） · 章节内共 ${p.sourceStats.groupQuestionOccurrenceCount} 个题目位置，全局去重 ${p.sourceStats.uniqueLeetcodeQuestionCount} 题</div>`
      : '';
    return `<div class="card plan-card${isCollapsed ? ' collapsed' : ''}">
      <div class="plan-top">
        <button class="plan-collapse" data-slug="${p.slug}" title="${isCollapsed ? '展开题单' : '收起题单'}">▾</button>
        <span class="plan-name"><a href="${escapeHtml(p.sourceUrl || `https://leetcode.cn/studyplan/${p.slug}/`)}" target="_blank">${escapeHtml(p.name)}</a></span>
        ${roundBadge}
        <span class="plan-spacer"></span>
        <span class="plan-frac"><b>${pr.done}</b> / ${pr.total} ${p.videoCount ? '道力扣' : '题'}</span>
        ${p.videoCount ? `<span class="plan-video-count">${p.videoCount} 期视频</span>` : ''}
        <span class="plan-pct">${pct}%</span>
        <span class="plan-actions">
          <button class="plan-star${isPrimary ? ' on' : ''}" data-slug="${p.slug}" title="${isPrimary ? '当前展示在首页大环' : '设为首页展示的题单'}">${isPrimary ? '★' : '☆'}</button>
          <button class="plan-restart" data-slug="${p.slug}" data-name="${escapeHtml(p.name)}" title="重刷：从现在起重新计数（不影响提交历史）">↻</button>
          <button class="plan-del" data-slug="${p.slug}" title="移除该题单">✕</button>
        </span>
      </div>
      <div class="plan-bar"><i style="width:0" data-w="${pct}"></i></div>
      ${sourceStats}
      <div class="plan-groups">${groupRows}</div>
    </div>`;
  }).join('');
  requestAnimationFrame(() => {
    grid.querySelectorAll('.plan-card:not(.collapsed) .plan-bar>i').forEach((i) => { i.style.width = i.dataset.w + '%'; });
  });
}

const PLAN_PRESETS = [
  { slug: 'code-thinking', name: '代码随想录' },
  { slug: 'programming-skills', name: '编程基础 0 到 1' },
  { slug: 'top-100-liked', name: 'LeetCode 热题 100' },
  { slug: 'top-interview-150', name: '面试经典 150 题' },
  { slug: 'leetcode-75', name: 'LeetCode 75' },
  { slug: 'sql-free-50', name: 'SQL 入门 50 题' },
];

function openPlanDialog() {
  const msg = $('#planMsg');
  msg.textContent = ''; msg.className = 'dialog-msg';
  $('#planInput').value = '';
  const enabled = new Set(state.plans.map((p) => p.slug));
  $('#planPresets').innerHTML = PLAN_PRESETS.map((p) =>
    `<button data-slug="${p.slug}" ${enabled.has(p.slug) ? 'disabled title="已添加"' : ''}>${p.name}${enabled.has(p.slug) ? ' ✓' : ''}</button>`
  ).join('');
  $('#planDialog').showModal();
}

async function addPlan(slugInput) {
  const msg = $('#planMsg');
  msg.textContent = '正在获取题单…'; msg.className = 'dialog-msg';
  $('#planOkBtn').disabled = true;
  try {
    const r = await api('/api/plans/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: slugInput }),
    });
    if (r.ok) {
      $('#planDialog').close();
      toast(`✓ 已添加题单「${r.plan.name}」`);
      await loadData();
    } else {
      msg.textContent = '✗ ' + (r.error || '添加失败');
      msg.className = 'dialog-msg error';
    }
  } catch (e) {
    msg.textContent = '✗ 请求失败: ' + e.message;
    msg.className = 'dialog-msg error';
  } finally {
    $('#planOkBtn').disabled = false;
  }
}

async function removePlan(slug) {
  await api('/api/plans/remove', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  toast('已移除题单');
  await loadData();
}

async function restartPlan(slug, name) {
  if (!confirm(`重新开始刷《${name}》？\n\n进度将从现在起重新计数（此前的完成归零），你的提交历史不受影响。\n以后想看旧进度，可点“撤销”恢复。`)) return;
  const r = await api('/api/plans/restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  if (r.ok) { toast(`↻ 已开始第 ${r.round} 轮`); await loadData(); }
}

async function undoRestart(slug) {
  if (!confirm('撤销最近一次重刷，回到上一轮的进度计数？')) return;
  await api('/api/plans/restart-cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  toast('已撤销重刷');
  await loadData();
}

/* ---------- ECharts 图表 ---------- */

function getChart(id) {
  if (!state.charts[id]) state.charts[id] = echarts.init(document.getElementById(id));
  return state.charts[id];
}

function tooltipStyle() {
  return {
    backgroundColor: cssv('--toast-bg'), borderColor: cssv('--border-strong'),
    textStyle: { color: cssv('--txt'), fontSize: 12 },
    extraCssText: 'border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.3);',
  };
}
function axisText() { return { color: cssv('--txt-faint'), fontSize: 12 }; }
function splitLine() { return { lineStyle: { color: cssv('--chart-grid') || cssv('--border') } }; }
// 当前皮肤是否为「新粗野主义」——粗野皮肤下图表用纯色方角 + 描边，不用渐变圆角
function isBrutal() { return document.documentElement.getAttribute('data-skin') === 'brutal'; }
function brutalBarBorder() {
  return isBrutal() ? { borderColor: cssv('--border'), borderWidth: 2 } : {};
}

function renderDifficulty(s) {
  const order = ['Easy', 'Medium', 'Hard', 'Unknown'];
  const colors = { Easy: cssv('--easy'), Medium: cssv('--medium'), Hard: cssv('--hard'), Unknown: cssv('--txt-faint') };
  const data = order.filter((d) => s.byDifficulty[d]).map((d) => ({
    name: DIFF_NAME[d], value: s.byDifficulty[d], itemStyle: { color: colors[d] },
  }));
  getChart('difficultyChart').setOption({
    tooltip: { ...tooltipStyle(), formatter: (p) => `${p.name}：<b>${p.value}</b> 题（${p.percent}%）` },
    legend: { bottom: 4, textStyle: { color: cssv('--txt-dim'), fontSize: 12 }, itemWidth: 12, itemHeight: 12, icon: 'roundRect' },
    series: [{
      type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'],
      itemStyle: { borderColor: isBrutal() ? cssv('--border') : cssv('--pie-border'), borderWidth: 3, borderRadius: isBrutal() ? 0 : 6 },
      label: { color: cssv('--txt'), formatter: '{b} {c}' },
      data,
    }],
  }, true);
}

function renderTags(s) {
  const top = [...s.byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).reverse();
  getChart('tagChart').setOption({
    tooltip: { ...tooltipStyle(), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}：<b>${p[0].value}</b> 题` },
    grid: { left: 10, right: 44, top: 10, bottom: 10, containLabel: true },
    xAxis: { type: 'value', axisLabel: axisText(), splitLine: splitLine() },
    yAxis: { type: 'category', data: top.map((t) => t[0]), axisLabel: { color: cssv('--txt-dim'), fontSize: 13 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', data: top.map((t) => t[1]),
      itemStyle: {
        borderRadius: isBrutal() ? 0 : [0, 6, 6, 0],
        color: isBrutal() ? cssv('--heat') : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: cssv('--heat') + 'aa' }, { offset: 1, color: cssv('--heat') },
        ]),
        ...brutalBarBorder(),
      },
      label: { show: true, position: 'right', color: cssv('--txt-dim') },
      barMaxWidth: isBrutal() ? 18 : 16,
    }],
  }, true);
}

function renderMonth(s) {
  let keys;
  if (state.year === 'all') keys = [...s.perMonth.keys()].sort();
  else keys = [...Array(12)].map((_, i) => `${state.year}-${pad2(i + 1)}`);
  const solves = keys.map((k) => (s.perMonth.get(k) || { solves: 0 }).solves);
  const uniq = keys.map((k) => { const m = s.perMonth.get(k); return m ? m.keys.size : 0; });
  const labels = state.year === 'all' ? keys : keys.map((k) => `${Number(k.slice(5))}月`);
  getChart('monthChart').setOption({
    tooltip: { ...tooltipStyle(), trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: cssv('--txt-dim'), fontSize: 12 }, itemWidth: 12, itemHeight: 12 },
    grid: { left: 10, right: 10, top: 20, bottom: 36, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: axisText(), axisLine: { lineStyle: { color: cssv('--border-strong') } } },
    yAxis: { type: 'value', axisLabel: axisText(), splitLine: splitLine() },
    series: [
      {
        name: '一共做的题', type: 'bar', data: solves, barMaxWidth: 22,
        itemStyle: {
          borderRadius: isBrutal() ? 0 : [5, 5, 0, 0],
          color: isBrutal() ? cssv('--heat') : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: cssv('--heat') }, { offset: 1, color: cssv('--heat') + '55' },
          ]),
          ...brutalBarBorder(),
        },
      },
      { name: '不重复的题', type: 'line', data: uniq, smooth: true, symbolSize: 6, itemStyle: { color: cssv('--easy') }, lineStyle: { width: 2.5 } },
    ],
  }, true);
}

/* ---------- 明细表 ---------- */

function renderTable(s) {
  state.tableRows = [...s.perProblem.entries()].map(([key, p]) => {
    const q = problemOf(key);
    return {
      key,
      slug: key.startsWith('t:') ? null : key,
      fid: q.frontendId || '',
      title: q.translatedTitle || p.title || key,
      difficulty: q.difficulty || 'Unknown',
      tags: (q.tags || []).map((t) => t.translatedName),
      count: p.count,
      last: p.lastDay,
    };
  });
  drawTableBody();
}

function drawTableBody() {
  const kw = $('#tableSearch').value.trim().toLowerCase();
  let rows = state.tableRows;
  if (kw) {
    rows = rows.filter((r) =>
      r.fid.toLowerCase().includes(kw) || r.title.toLowerCase().includes(kw) ||
      r.tags.some((t) => t.toLowerCase().includes(kw)));
  }
  const { key, desc } = state.tableSort;
  const diffOrder = { Easy: 0, Medium: 1, Hard: 2, Unknown: 3 };
  rows = rows.slice().sort((a, b) => {
    let va, vb;
    if (key === 'fid') { va = Number(a.fid) || 1e9; vb = Number(b.fid) || 1e9; }
    else if (key === 'difficulty') { va = diffOrder[a.difficulty]; vb = diffOrder[b.difficulty]; }
    else if (key === 'last') { va = a.last; vb = b.last; }
    else { va = a.count; vb = b.count; }
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return (Number(a.fid) || 0) - (Number(b.fid) || 0);
  });
  $('#tableCount').textContent = `共 ${rows.length} 题`;
  $('#problemTable tbody').innerHTML = rows.map((r) => `
    <tr>
      <td class="fid">${r.fid || '—'}</td>
      <td>${r.slug
        ? `<a href="https://leetcode.cn/problems/${r.slug}/" target="_blank">${escapeHtml(r.title)}</a>`
        : escapeHtml(r.title)}</td>
      <td><span class="diff ${r.difficulty}">${DIFF_NAME[r.difficulty] || r.difficulty}</span></td>
      <td>${r.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</td>
      <td class="count-cell">${r.count}</td>
      <td class="last-cell">${r.last}</td>
    </tr>`).join('');
}

/* ================= 演示数据 ================= */

function buildDemoData() {
  const tagPool = [
    ['array', '数组'], ['hash-table', '哈希表'], ['dynamic-programming', '动态规划'],
    ['greedy', '贪心'], ['two-pointers', '双指针'], ['string', '字符串'],
    ['binary-search', '二分查找'], ['tree', '树'], ['depth-first-search', '深度优先搜索'],
    ['breadth-first-search', '广度优先搜索'], ['stack', '栈'], ['linked-list', '链表'],
    ['graph', '图'], ['backtracking', '回溯'], ['sliding-window', '滑动窗口'],
    ['prefix-sum', '前缀和'], ['heap-priority-queue', '堆（优先队列）'], ['sorting', '排序'],
    ['bit-manipulation', '位运算'], ['math', '数学'],
  ];
  const famous = [
    ['two-sum', '两数之和', 'Easy'], ['add-two-numbers', '两数相加', 'Medium'],
    ['longest-substring-without-repeating-characters', '无重复字符的最长子串', 'Medium'],
    ['median-of-two-sorted-arrays', '寻找两个正序数组的中位数', 'Hard'],
    ['reverse-linked-list', '反转链表', 'Easy'], ['lru-cache', 'LRU 缓存', 'Medium'],
    ['trapping-rain-water', '接雨水', 'Hard'], ['climbing-stairs', '爬楼梯', 'Easy'],
    ['coin-change', '零钱兑换', 'Medium'], ['edit-distance', '编辑距离', 'Hard'],
  ];
  const langs = ['Python3', 'Python3', 'Python3', 'C++', 'C++', 'Java'];
  const rnd = (n) => Math.floor(Math.random() * n);

  const problems = {};
  const slugs = [];
  for (let i = 0; i < 170; i++) {
    let slug, title, diff;
    if (i < famous.length) { [slug, title, diff] = famous[i]; }
    else {
      slug = `demo-problem-${i}`;
      title = `演示题目 ${i + 1}`;
      diff = ['Easy', 'Medium', 'Medium', 'Medium', 'Hard'][rnd(5)];
    }
    const tags = [];
    const n = 1 + rnd(3);
    while (tags.length < n) {
      const t = tagPool[rnd(tagPool.length)];
      if (!tags.some((x) => x.slug === t[0])) tags.push({ slug: t[0], name: t[0], translatedName: t[1] });
    }
    problems[slug] = { slug, frontendId: String(i + 1), title: slug, translatedTitle: title, difficulty: diff, tags };
    slugs.push(slug);
  }

  const submissions = [];
  let id = 1;
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1);
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const isThisYear = d.getFullYear() === now.getFullYear();
    let p = isThisYear ? 0.72 : 0.35;
    if (d.getDay() === 0 || d.getDay() === 6) p += 0.1;
    if (Math.random() > p) continue;
    const solveN = 1 + rnd(isThisYear ? 4 : 2);
    for (let k = 0; k < solveN; k++) {
      const slug = slugs[rnd(slugs.length)];
      const ts = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9 + rnd(13), rnd(60)).getTime() / 1000);
      const lang = langs[rnd(langs.length)];
      if (Math.random() < 0.3) {
        submissions.push({ id: String(id++), slug, title: problems[slug].translatedTitle, status: 'Wrong Answer', lang, ts: ts - 600 });
      }
      submissions.push({ id: String(id++), slug, title: problems[slug].translatedTitle, status: 'Accepted', lang, ts });
    }
  }
  return { submissions, problems };
}

/* ================= 数据加载 / 同步 ================= */

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

async function loadData() {
  const data = await api('/api/data');
  state.submissions = data.submissions || [];
  state.problems = data.problems || {};
  state.plans = data.plans || [];
  state.demoMode = false;
  $('#demoBadge').classList.add('hidden');
  showView();
}

function showView() {
  const hasData = state.submissions.length > 0;
  $('#emptyState').classList.toggle('hidden', hasData);
  $('#dashboard').classList.toggle('hidden', !hasData);
  if (hasData) {
    const thisYear = new Date().getFullYear();
    const years = new Set(buildSolveEvents(state.submissions).map((e) => e.year));
    if (state.year !== 'all' && !years.has(state.year)) state.year = 'all';
    if (state.year === 'all' && years.has(thisYear)) state.year = thisYear;
    state.calYear = state.year === 'all' ? thisYear : state.year;
    render();
  }
}

let pollTimer = null;
function setSyncBar(text, cls) {
  const bar = $('#syncBar');
  bar.textContent = text;
  bar.className = 'sync-bar' + (cls ? ' ' + cls : '');
  bar.classList.toggle('hidden', !text);
}

let toastT;
function toast(m) {
  const el = $('#toast');
  el.textContent = m;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

async function refreshStatus() {
  const st = await api('/api/status');
  if (st.username) {
    $('#userBadge').textContent = st.username;
    $('#userBadge').classList.remove('hidden');
  }
  const sync = st.sync || {};
  if (sync.running) {
    setSyncBar('⏳ ' + (sync.message || '同步中…'));
    $('#syncBtn').disabled = true;
    if (!pollTimer) pollTimer = setInterval(refreshStatus, 1000);
  } else {
    $('#syncBtn').disabled = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (sync.phase === 'error') {
      setSyncBar('✗ ' + (sync.message || '同步失败'), 'error');
    } else if (sync.phase === 'done') {
      setSyncBar('✓ ' + (sync.message || '同步完成'), 'ok');
      await loadData();
      setTimeout(() => setSyncBar(''), 6000);
      sync.phase = 'idle';
    }
  }
  return st;
}

async function startSync() {
  const r = await api('/api/sync', { method: 'POST' });
  if (!r.ok) {
    if (/登录/.test(r.error || '')) openSettings();
    else setSyncBar('✗ ' + (r.error || '无法开始同步'), 'error');
    return;
  }
  setSyncBar('⏳ 同步已开始…');
  $('#syncBtn').disabled = true;
  if (!pollTimer) pollTimer = setInterval(refreshStatus, 1000);
}

/* ================= 登录弹窗 ================= */

let authMode = 'pwd';

function openSettings() {
  $('#authMsg').textContent = '';
  $('#authMsg').className = 'dialog-msg';
  $('#settingsDialog').showModal();
}

function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('#authSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#pwdPane').classList.toggle('hidden', m !== 'pwd');
  $('#cookiePane').classList.toggle('hidden', m !== 'cookie');
  $('#authOkBtn').textContent = m === 'pwd' ? '登录' : '验证并保存';
}

async function submitAuth() {
  const msg = $('#authMsg');
  const btn = $('#authOkBtn');
  let payload, url;
  if (authMode === 'pwd') {
    const username = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    if (!username || !password) { msg.textContent = '请输入账号和密码'; msg.className = 'dialog-msg error'; return; }
    url = '/api/login'; payload = { username, password };
  } else {
    const cookie = $('#cookieInput').value.trim();
    if (!cookie) { msg.textContent = '请先粘贴 Cookie'; msg.className = 'dialog-msg error'; return; }
    url = '/api/cookie'; payload = { cookie };
  }
  msg.textContent = authMode === 'pwd' ? '正在登录…' : '正在验证…';
  msg.className = 'dialog-msg';
  btn.disabled = true;
  try {
    const r = await api(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      msg.textContent = `✓ 登录成功：${r.username}，即将开始同步…`;
      msg.className = 'dialog-msg ok';
      $('#userBadge').textContent = r.username;
      $('#userBadge').classList.remove('hidden');
      $('#loginPass').value = '';
      setTimeout(() => { $('#settingsDialog').close(); toast('✓ 已登录 ' + r.username); startSync(); }, 900);
    } else {
      msg.textContent = '✗ ' + (r.error || '失败');
      msg.className = 'dialog-msg error';
    }
  } catch (e) {
    msg.textContent = '✗ 请求失败: ' + e.message;
    msg.className = 'dialog-msg error';
  } finally {
    btn.disabled = false;
  }
}

/* ================= 主题 / 皮肤 ================= */

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('#themeIcon').textContent = t === 'light' ? '☀️' : '🌙';
  try { localStorage.setItem('lc-theme', t); } catch (e) { /* ignore */ }
  if (!$('#dashboard').classList.contains('hidden') && state.submissions.length) render();
}

const SKIN_NAME = { glass: '玻璃拟态', brutal: '新粗野主义' };

function applySkin(sk) {
  document.documentElement.setAttribute('data-skin', sk);
  try { localStorage.setItem('lc-skin', sk); } catch (e) { /* ignore */ }
  $('#skinBtn').title = `切换界面风格（当前：${SKIN_NAME[sk]}）`;
  // 图表颜色 / 圆角随皮肤走，需要重绘
  if (!$('#dashboard').classList.contains('hidden') && state.submissions.length) render();
}

/* ================= 事件绑定 & 启动 ================= */

$('#yearSel').addEventListener('change', (e) => {
  state.year = e.target.value === 'all' ? 'all' : Number(e.target.value);
  if (state.year !== 'all') state.calYear = state.year;
  render();
});
$('#syncBtn').addEventListener('click', startSync);
$('#settingsBtn').addEventListener('click', openSettings);
$('#emptyLoginBtn').addEventListener('click', openSettings);
$('#authCancelBtn').addEventListener('click', () => $('#settingsDialog').close());
$('#authOkBtn').addEventListener('click', submitAuth);
$('#loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
document.querySelectorAll('#authSeg button').forEach((b) =>
  b.addEventListener('click', () => setAuthMode(b.dataset.m)));
$('#themeBtn').addEventListener('click', () =>
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));
$('#skinBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-skin') === 'brutal' ? 'glass' : 'brutal';
  applySkin(next);
  toast(`◱ 已切换到「${SKIN_NAME[next]}」风格`);
});
$('#demoBtn').addEventListener('click', () => {
  const demo = buildDemoData();
  state.submissions = demo.submissions;
  state.problems = demo.problems;
  state.demoMode = true;
  state.year = new Date().getFullYear();
  state.calYear = state.year;
  $('#demoBadge').classList.remove('hidden');
  $('#emptyState').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  render();
});
$('#calPrev').addEventListener('click', () => calStep(-1));
$('#calNext').addEventListener('click', () => calStep(1));
document.querySelectorAll('#calViewSeg button').forEach((b) =>
  b.addEventListener('click', () => {
    state.calView = b.dataset.v;
    document.querySelectorAll('#calViewSeg button').forEach((x) => x.classList.toggle('on', x === b));
    if (state.calView === 'month' && state.calYear === new Date().getFullYear()) state.calMonth = new Date().getMonth();
    if (lastStats) renderCalendar(lastStats);
  }));
$('#addPlanBtn').addEventListener('click', openPlanDialog);
$('#planCancelBtn').addEventListener('click', () => $('#planDialog').close());
$('#planOkBtn').addEventListener('click', () => {
  const v = $('#planInput').value.trim();
  if (!v) { $('#planMsg').textContent = '请输入题单链接或 slug'; $('#planMsg').className = 'dialog-msg error'; return; }
  addPlan(v);
});
$('#planPresets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-slug]');
  if (b && !b.disabled) addPlan(b.dataset.slug);
});
$('#plansGrid').addEventListener('click', (e) => {
  const collapse = e.target.closest('.plan-collapse');
  if (collapse) {
    const card = collapse.closest('.plan-card');
    const nowCollapsed = !card.classList.contains('collapsed');
    card.classList.toggle('collapsed', nowCollapsed);
    collapse.title = nowCollapsed ? '展开题单' : '收起题单';
    setPlanCollapsed(collapse.dataset.slug, nowCollapsed);
    if (!nowCollapsed) { // 展开时补回进度条动画
      const bar = card.querySelector('.plan-bar>i');
      if (bar) requestAnimationFrame(() => { bar.style.width = bar.dataset.w + '%'; });
    }
    return;
  }
  const undo = e.target.closest('.round-undo');
  if (undo) { undoRestart(undo.dataset.slug); return; }
  const restart = e.target.closest('.plan-restart');
  if (restart) { restartPlan(restart.dataset.slug, restart.dataset.name); return; }
  const del = e.target.closest('.plan-del');
  if (del) { removePlan(del.dataset.slug); return; }
  const star = e.target.closest('.plan-star');
  if (star) {
    try { localStorage.setItem('lc-primary-plan', star.dataset.slug); } catch (err) { /* ignore */ }
    toast('★ 首页大环已切换');
    render();
    return;
  }
  const row = e.target.closest('.pg-row.clickable');
  if (row) row.classList.toggle('open');
});
$('#tableSearch').addEventListener('input', drawTableBody);
document.querySelectorAll('#problemTable thead th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.tableSort.key === key) state.tableSort.desc = !state.tableSort.desc;
    else state.tableSort = { key, desc: key === 'count' || key === 'last' };
    document.querySelectorAll('#problemTable thead th').forEach((t) => {
      t.classList.remove('sorted');
      t.textContent = t.textContent.replace(/ [▾▴]$/, '');
    });
    th.classList.add('sorted');
    th.textContent += state.tableSort.desc ? ' ▾' : ' ▴';
    drawTableBody();
  });
});
window.addEventListener('resize', () => Object.values(state.charts).forEach((c) => c.resize()));

// 即时悬浮提示（事件委托，re-render 后无需重新绑定）
(function () {
  const tip = $('#chartTip');
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.textContent = el.dataset.tip;
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('show')) return;
    const x = Math.min(e.clientX + 13, innerWidth - tip.offsetWidth - 8);
    const y = Math.max(8, e.clientY - 40);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-tip]')) tip.classList.remove('show');
  });
})();

applyTheme((() => { try { return localStorage.getItem('lc-theme') || 'dark'; } catch (e) { return 'dark'; } })());
applySkin((() => { try { return localStorage.getItem('lc-skin') || 'glass'; } catch (e) { return 'glass'; } })());

(async function init() {
  await refreshStatus();
  await loadData();
})();
