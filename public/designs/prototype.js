'use strict';

const theme = document.body.dataset.theme || 'orbit';

const themes = {
  orbit: {
    brand: 'CODEPATH',
    brandCn: '力扣训练仪表盘',
    mark: '◒',
    nav: ['概览', '题单', '题库', '日历'],
    accentName: '轨道 / ORBIT',
    tagline: '把每一次练习，放回长期轨道。',
  },
  daybreak: {
    brand: '步进',
    brandCn: 'STEPWISE',
    mark: '▰',
    nav: ['总览', '题单', '已完成', '活动'],
    accentName: '晴窗 / DAYBREAK',
    tagline: '看见进步，也看见下一步。',
  },
  paceline: {
    brand: 'PACELINE',
    brandCn: '刷题训练场',
    mark: '///',
    nav: ['总览', '训练计划', '题目记录', '活跃度'],
    accentName: '配速 / PACELINE',
    tagline: '稳定配速，持续推进。',
  },
};

const ui = themes[theme];

const plans = [
  { id: 'foundation', index: '01', name: '编程基础 0 到 1', note: '基础语法与数据结构入门', done: 19, total: 33, stats: [25, 34, 14, 7] },
  { id: 'hot100', index: '02', name: 'LeetCode 热题 100', note: '高频题型强化训练', done: 42, total: 100, stats: [38, 67, 21, 9] },
  { id: 'interview150', index: '03', name: '面试经典 150 题', note: '系统化能力提升', done: 27, total: 150, stats: [24, 39, 16, 6] },
].map((plan) => ({ ...plan, pct: Math.round(plan.done / plan.total * 100) }));

const difficulties = [
  { key: 'Easy', label: '简单', value: 20 },
  { key: 'Medium', label: '中等', value: 39 },
  { key: 'Hard', label: '困难', value: 22 },
];

const monthly = [8, 11, 7, 10, 6, 9, 12, 8, 9, 10, 13, 11];
const topics = [
  { label: '数组', value: 20, icon: '⌘' },
  { label: '字符串', value: 16, icon: 'Aa' },
  { label: '哈希表', value: 12, icon: '#' },
  { label: '模拟', value: 10, icon: '◇' },
  { label: '数学', value: 10, icon: 'Σ' },
  { label: '双指针', value: 8, icon: '↔' },
];

const problems = [
  { fid: 1, title: '两数之和', difficulty: 'Easy', tags: ['数组', '哈希表'], count: 3, last: '2026-03-14' },
  { fid: 15, title: '三数之和', difficulty: 'Medium', tags: ['数组', '双指针', '排序'], count: 2, last: '2026-03-10' },
  { fid: 20, title: '有效的括号', difficulty: 'Easy', tags: ['栈', '字符串'], count: 4, last: '2026-03-12' },
  { fid: 22, title: '括号生成', difficulty: 'Medium', tags: ['字符串', '回溯'], count: 2, last: '2026-03-02' },
  { fid: 49, title: '字母异位词分组', difficulty: 'Medium', tags: ['哈希表', '字符串', '排序'], count: 2, last: '2026-03-08' },
  { fid: 56, title: '合并区间', difficulty: 'Medium', tags: ['数组', '排序'], count: 3, last: '2026-03-13' },
  { fid: 70, title: '爬楼梯', difficulty: 'Easy', tags: ['动态规划', '数学'], count: 5, last: '2026-03-11' },
  { fid: 128, title: '最长连续序列', difficulty: 'Medium', tags: ['数组', '哈希表'], count: 2, last: '2026-03-05' },
  { fid: 146, title: 'LRU 缓存', difficulty: 'Medium', tags: ['设计', '哈希表', '链表'], count: 1, last: '2026-02-28' },
  { fid: 155, title: '最小栈', difficulty: 'Medium', tags: ['栈', '设计'], count: 1, last: '2026-02-22' },
  { fid: 200, title: '岛屿数量', difficulty: 'Medium', tags: ['深度优先搜索', '图'], count: 2, last: '2026-02-18' },
  { fid: 239, title: '滑动窗口最大值', difficulty: 'Hard', tags: ['队列', '滑动窗口'], count: 1, last: '2026-02-12' },
];

const state = {
  selectedPlan: 0,
  planFilter: 'all',
  search: '',
  difficulty: 'all',
  tag: 'all',
  sort: 'last',
  desc: true,
  page: 1,
  pageSize: 6,
  calendarView: 'year',
  calendarYear: 2026,
  calendarMonth: 2,
};

const icon = (name) => {
  const paths = {
    sync: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v5h5M4 13a8 8 0 0 0 14.9 3M20 20v-5h-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="m5 12 14 0M13 6l6 6-6 6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.arrow}</svg>`;
};

function buildLineChart() {
  const width = 720;
  const height = 230;
  const left = 36;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const max = 15;
  const x = (i) => left + i * ((width - left - right) / 11);
  const y = (v) => top + (max - v) * ((height - top - bottom) / max);
  const points = monthly.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `M ${x(0)} ${height - bottom} L ${monthly.map((v, i) => `${x(i)} ${y(v)}`).join(' L ')} L ${x(11)} ${height - bottom} Z`;
  const guides = [0, 5, 10, 15].map((v) => `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v)+4}">${v}</text>`).join('');
  const bars = monthly.map((v, i) => `<rect x="${x(i)-7}" y="${y(v)}" width="14" height="${height-bottom-y(v)}" rx="2"/>`).join('');
  const months = monthly.map((v, i) => `<text class="month-label" x="${x(i)}" y="${height-8}" text-anchor="middle">${i+1}月</text><circle cx="${x(i)}" cy="${y(v)}" r="4"><title>${i+1} 月 · ${v} 题</title></circle>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="2026 年每月独立题目趋势"><g class="chart-guides">${guides}</g><g class="chart-bars">${bars}</g><path class="chart-area" d="${area}"/><polyline points="${points}"/>${months}</svg>`;
}

function appTemplate() {
  return `
    <div class="app-shell">
      <aside class="side-rail" aria-label="侧边导航">
        <a class="rail-brand" href="index.html" aria-label="返回设计总览"><span>${ui.mark}</span><b>${ui.brand}</b></a>
        <nav>
          <button class="is-active" data-target="overview">${icon('target')}<span>${ui.nav[0]}</span></button>
          <button data-target="plans">${icon('list')}<span>${ui.nav[1]}</span></button>
          <button data-target="records">${icon('chart')}<span>${ui.nav[2]}</span></button>
          <button data-target="calendar">${icon('calendar')}<span>${ui.nav[3]}</span></button>
        </nav>
        <div class="rail-foot">
          <a href="index.html" title="返回全部设计">全部设计</a>
          <span class="connection"><i></i> 已连接</span>
        </div>
      </aside>

      <div class="page-frame">
        <header class="topbar">
          <a class="brand" href="index.html" aria-label="返回设计总览">
            <span class="brand-mark">${ui.mark}</span>
            <span><b>${ui.brand}</b><small>${ui.brandCn}</small></span>
          </a>
          <nav class="topnav" aria-label="主导航">
            <button class="is-active" data-target="overview">${ui.nav[0]}</button>
            <button data-target="plans">${ui.nav[1]}</button>
            <button data-target="records">${ui.nav[2]}</button>
            <button data-target="calendar">${ui.nav[3]}</button>
          </nav>
          <div class="header-actions">
            <label class="year-select" aria-label="统计年份">
              <select id="yearSelect">
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="all">全部年份</option>
              </select>
            </label>
            <button class="sync-button" id="syncButton">${icon('sync')}<span>同步数据</span></button>
            <button class="user-button" aria-label="当前用户"><span class="avatar">W</span><span>wu-si-san</span><i></i></button>
          </div>
        </header>

        <main>
          <section class="hero-section" id="overview">
            <div class="hero-copy">
              <span class="functional-label">当前训练计划</span>
              <h1 id="heroPlanName">${plans[0].name}</h1>
              <p>${ui.tagline}</p>
              <div class="hero-fraction"><strong id="heroDone">19</strong><span>/</span><strong id="heroTotal">33</strong><small>题</small></div>
              <div class="hero-progressbar" aria-label="完成进度 58%"><i id="heroProgressBar" style="width:58%"></i></div>
            </div>
            <div class="hero-progress">
              <div class="progress-dial" id="progressDial" style="--progress:58">
                <div><strong id="heroProgressValue">58%</strong><span>计划完成率</span></div>
              </div>
            </div>
            <div class="hero-spark">
              <div class="mini-head"><span>最近 12 个月</span><b><i></i> 独立题目</b></div>
              ${buildLineChart()}
            </div>
            <div class="kpi-strip" aria-label="关键数据">
              <div><span>01</span><strong>25</strong><small>独立题目</small></div>
              <div><span>02</span><strong>34</strong><small>完成次数</small></div>
              <div><span>03</span><strong>14</strong><small>活跃天数</small></div>
              <div><span>04</span><strong>7</strong><small>最长连续</small></div>
            </div>
          </section>

          <section class="section plans-section" id="plans">
            <div class="section-heading">
              <div><span class="section-index">01</span><h2>训练计划进度</h2><p>按当前轮次计算 · 点击计划切换首页主题进度</p></div>
              <div class="segmented" id="planFilter" aria-label="筛选训练计划">
                <button class="is-active" data-filter="all">全部</button>
                <button data-filter="active">进行中</button>
                <button data-filter="done">已完成</button>
              </div>
            </div>
            <div class="plan-list" id="planList"></div>
          </section>

          <section class="section analytics-section" id="analytics">
            <article class="metric-panel difficulty-panel">
              <div class="panel-heading"><div><span>02</span><h2>难度分布</h2></div><small>累计独立题目</small></div>
              <div class="difficulty-content">
                <div class="donut" role="img" aria-label="简单 20 题，中等 39 题，困难 22 题"><div><strong>81</strong><span>总题目</span></div></div>
                <div class="difficulty-legend">
                  ${difficulties.map((d) => `<div class="diff-${d.key.toLowerCase()}"><i></i><span>${d.label}</span><strong>${d.value}</strong><small>${Math.round(d.value/81*100)}%</small></div>`).join('')}
                </div>
              </div>
            </article>
            <article class="metric-panel trend-panel">
              <div class="panel-heading"><div><span>03</span><h2>月度趋势</h2></div><label><select aria-label="趋势指标"><option>独立题目</option><option>完成次数</option></select></label></div>
              ${buildLineChart()}
            </article>
          </section>

          <section class="section topic-section">
            <div class="section-heading compact">
              <div><span class="section-index">04</span><h2>题型分布</h2><p>点击题型可直接筛选题目明细</p></div>
              <span class="section-meta">累计独立题目 · 前 6 类</span>
            </div>
            <div class="topic-rail" id="topicRail">
              ${topics.map((topic, index) => `<button data-tag="${topic.label}" style="--topic:${topic.value};--topic-index:${index}"><span class="topic-icon">${topic.icon}</span><span><b>${topic.label}</b><strong>${topic.value}</strong><small>${Math.round(topic.value/81*100)}%</small></span><i></i></button>`).join('')}
            </div>
          </section>

          <section class="section records-section" id="records">
            <div class="section-heading records-heading">
              <div><span class="section-index">05</span><h2>已完成题目明细</h2><p>同题同日多次提交计一次</p></div>
              <div class="table-toolbar">
                <label class="search-field">${icon('search')}<input id="problemSearch" type="search" placeholder="搜索题号 / 标题 / 标签" autocomplete="off"></label>
                <label><select id="difficultyFilter" aria-label="筛选难度"><option value="all">难度：全部</option><option value="Easy">简单</option><option value="Medium">中等</option><option value="Hard">困难</option></select></label>
                <label><select id="tagFilter" aria-label="筛选标签"><option value="all">标签：全部</option>${topics.map((t) => `<option value="${t.label}">${t.label}</option>`).join('')}</select></label>
              </div>
            </div>
            <div class="table-shell">
              <div class="table-scroll">
                <table>
                  <thead><tr>
                    <th><button data-sort="fid">题号</button></th>
                    <th><button data-sort="title">标题</button></th>
                    <th><button data-sort="difficulty">难度</button></th>
                    <th>标签</th>
                    <th><button data-sort="count">完成次数</button></th>
                    <th><button class="is-sorted" data-sort="last">最近完成 ↓</button></th>
                  </tr></thead>
                  <tbody id="problemRows"></tbody>
                </table>
              </div>
              <div class="table-footer"><span id="tableCount"></span><div class="pagination" id="pagination"></div><label><select id="pageSize" aria-label="每页条数"><option value="6">6 条/页</option><option value="10">10 条/页</option></select></label></div>
            </div>
          </section>

          <section class="section calendar-section" id="calendar">
            <div class="section-heading calendar-heading">
              <div><span class="section-index">06</span><h2>每日活跃度日历</h2><p>颜色越深，当天完成的不同题目越多</p></div>
              <div class="calendar-controls">
                <div class="segmented" id="calendarView"><button class="is-active" data-view="year">按年</button><button data-view="month">按月</button></div>
                <button class="calendar-step" data-step="-1" aria-label="上一时段">‹</button>
                <strong id="calendarRange">2026 年全年</strong>
                <button class="calendar-step" data-step="1" aria-label="下一时段">›</button>
              </div>
            </div>
            <div class="calendar-shell">
              <div class="calendar-months" id="calendarMonths">${Array.from({length:12}, (_, i) => `<span>${i+1}月</span>`).join('')}</div>
              <div class="calendar-board">
                <div class="week-labels"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
                <div class="heatmap" id="heatmap"></div>
              </div>
              <div class="calendar-foot"><span><b>14</b> 个活跃日 · <b>34</b> 次完成</span><span class="heat-legend">少 <i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><i data-level="5"></i> 多</span></div>
            </div>
          </section>
        </main>

        <footer>
          <div><b>${ui.brand}</b><span>${ui.brandCn}</span></div>
          <span>数据来源 · LeetCode</span>
          <span id="lastSync">最后同步 · 2026-03-15 10:24</span>
          <span class="connection"><i></i> 已连接</span>
          <span>${ui.accentName}</span>
        </footer>
      </div>

      <nav class="design-switcher" aria-label="切换新设计方案">
        <a class="${theme === 'orbit' ? 'is-current' : ''}" href="orbit.html" title="轨道 ORBIT">O</a>
        <a class="${theme === 'daybreak' ? 'is-current' : ''}" href="daybreak.html" title="晴窗 DAYBREAK">D</a>
        <a class="${theme === 'paceline' ? 'is-current' : ''}" href="paceline.html" title="配速 PACELINE">P</a>
        <a href="index.html" title="查看全部设计">＋</a>
      </nav>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>`;
}

document.querySelector('#app').innerHTML = appTemplate();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function renderPlans() {
  const visiblePlans = plans.filter((plan) => {
    if (state.planFilter === 'active') return plan.pct < 100;
    if (state.planFilter === 'done') return plan.pct === 100;
    return true;
  });
  const list = $('#planList');
  if (!visiblePlans.length) {
    list.innerHTML = '<div class="plan-empty"><strong>暂无已完成计划</strong><span>完成一轮训练后，它会出现在这里。</span></div>';
    return;
  }
  list.innerHTML = visiblePlans.map((plan) => {
    const originalIndex = plans.findIndex((item) => item.id === plan.id);
    return `<button class="plan-row ${originalIndex === state.selectedPlan ? 'is-selected' : ''}" data-plan="${originalIndex}">
      <span class="plan-index">${plan.index}</span>
      <span class="plan-name"><strong>${plan.name}</strong><small>${plan.note}</small></span>
      <span class="plan-progress"><b>${plan.pct}%</b><i><em style="width:${plan.pct}%"></em></i><small>${plan.done} / ${plan.total} 题</small></span>
      <span class="plan-stats"><span><b>${plan.stats[0]}</b><small>独立题目</small></span><span><b>${plan.stats[1]}</b><small>完成次数</small></span><span><b>${plan.stats[2]}</b><small>活跃天数</small></span><span><b>${plan.stats[3]}</b><small>最长连续</small></span></span>
      <span class="plan-arrow">${icon('chevron')}</span>
    </button>`;
  }).join('');
  $$('.plan-row', list).forEach((button) => {
    button.addEventListener('click', () => selectPlan(Number(button.dataset.plan)));
  });
}

function selectPlan(index) {
  state.selectedPlan = index;
  const plan = plans[index];
  $('#heroPlanName').textContent = plan.name;
  $('#heroDone').textContent = plan.done;
  $('#heroTotal').textContent = plan.total;
  $('#heroProgressValue').textContent = `${plan.pct}%`;
  $('#progressDial').style.setProperty('--progress', plan.pct);
  $('#heroProgressBar').style.width = `${plan.pct}%`;
  $('.hero-progressbar').setAttribute('aria-label', `完成进度 ${plan.pct}%`);
  renderPlans();
  showToast(`已切换主题计划 · ${plan.name}`);
}

function difficultyLabel(value) {
  return ({ Easy: '简单', Medium: '中等', Hard: '困难' })[value] || value;
}

function renderTable() {
  const query = state.search.trim().toLowerCase();
  let rows = problems.filter((problem) => {
    const matchesSearch = !query || [problem.fid, problem.title, ...problem.tags].join(' ').toLowerCase().includes(query);
    const matchesDifficulty = state.difficulty === 'all' || problem.difficulty === state.difficulty;
    const matchesTag = state.tag === 'all' || problem.tags.includes(state.tag);
    return matchesSearch && matchesDifficulty && matchesTag;
  });
  rows = rows.sort((a, b) => {
    const av = a[state.sort];
    const bv = b[state.sort];
    if (av === bv) return 0;
    const direction = av > bv ? 1 : -1;
    return state.desc ? -direction : direction;
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);
  $('#problemRows').innerHTML = pageRows.length ? pageRows.map((problem) => `
    <tr>
      <td><span class="problem-id">${problem.fid}</span></td>
      <td><button class="problem-title" data-problem="${problem.fid}">${problem.title}${icon('arrow')}</button></td>
      <td><span class="difficulty difficulty-${problem.difficulty.toLowerCase()}">${difficultyLabel(problem.difficulty)}</span></td>
      <td><span class="tags">${problem.tags.map((tag) => `<i>${tag}</i>`).join('')}</span></td>
      <td><strong class="count-value">${problem.count}</strong></td>
      <td><time>${problem.last}</time></td>
    </tr>`).join('') : '<tr><td class="empty-row" colspan="6">没有匹配的题目，试试调整筛选条件。</td></tr>';
  $('#tableCount').textContent = `共 ${rows.length} 条 · 第 ${state.page} / ${pageCount} 页`;
  $('#pagination').innerHTML = Array.from({ length: pageCount }, (_, i) => `<button class="${i + 1 === state.page ? 'is-active' : ''}" data-page="${i + 1}">${i + 1}</button>`).join('');
  $$('#pagination button').forEach((button) => button.addEventListener('click', () => {
    state.page = Number(button.dataset.page);
    renderTable();
  }));
  $$('.problem-title').forEach((button) => button.addEventListener('click', () => {
    showToast(`题目 ${button.dataset.problem} · 已打开详情预览`);
    button.closest('tr').classList.add('is-highlighted');
    window.setTimeout(() => button.closest('tr')?.classList.remove('is-highlighted'), 1100);
  }));
}

function activityLevel(column, row) {
  const seed = (column * 17 + row * 11 + column * row * 3) % 29;
  if (seed < 12) return 0;
  if (seed < 19) return 1;
  if (seed < 24) return 2;
  if (seed < 27) return 3;
  return seed === 27 ? 4 : 5;
}

function renderCalendar() {
  const heatmap = $('#heatmap');
  const months = $('#calendarMonths');
  if (state.calendarView === 'year') {
    heatmap.className = 'heatmap';
    months.classList.remove('is-month');
    months.innerHTML = Array.from({length:12}, (_, i) => `<span>${i+1}月</span>`).join('');
    const cells = [];
    for (let column = 0; column < 53; column += 1) {
      for (let row = 0; row < 7; row += 1) {
        const level = activityLevel(column, row);
        const day = column * 7 + row + 1;
        cells.push(`<i data-level="${level}" title="${state.calendarYear} 年第 ${day} 天 · ${level} 题"></i>`);
      }
    }
    heatmap.innerHTML = cells.join('');
    $('#calendarRange').textContent = `${state.calendarYear} 年全年`;
  } else {
    heatmap.className = 'heatmap month-view';
    months.classList.add('is-month');
    months.innerHTML = '<span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>周日</span>';
    heatmap.innerHTML = Array.from({ length: 35 }, (_, index) => {
      const day = index - 1;
      if (day < 1 || day > 31) return '<i class="is-empty"></i>';
      const level = activityLevel(state.calendarMonth * 5 + Math.floor(index / 7), index % 7);
      return `<i data-level="${level}" title="${state.calendarYear}-${String(state.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} · ${level} 题"><span>${day}</span></i>`;
    }).join('');
    $('#calendarRange').textContent = `${state.calendarYear} 年 ${state.calendarMonth + 1} 月`;
  }
}

function bindEvents() {
  $$('[data-target]').forEach((button) => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $$('[data-target]').forEach((item) => item.classList.toggle('is-active', item.dataset.target === button.dataset.target));
  }));

  $$('#planFilter button').forEach((button) => button.addEventListener('click', () => {
    state.planFilter = button.dataset.filter;
    $$('#planFilter button').forEach((item) => item.classList.toggle('is-active', item === button));
    renderPlans();
  }));

  $('#problemSearch').addEventListener('input', (event) => {
    state.search = event.target.value;
    state.page = 1;
    renderTable();
  });
  $('#difficultyFilter').addEventListener('change', (event) => {
    state.difficulty = event.target.value;
    state.page = 1;
    renderTable();
  });
  $('#tagFilter').addEventListener('change', (event) => {
    state.tag = event.target.value;
    state.page = 1;
    renderTable();
  });
  $('#pageSize').addEventListener('change', (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    renderTable();
  });
  $$('th button[data-sort]').forEach((button) => button.addEventListener('click', () => {
    const nextSort = button.dataset.sort;
    state.desc = state.sort === nextSort ? !state.desc : true;
    state.sort = nextSort;
    $$('th button[data-sort]').forEach((item) => {
      item.classList.toggle('is-sorted', item === button);
      item.textContent = item.dataset.sort === 'last' ? '最近完成' : item.textContent.replace(/ [↑↓]$/, '');
    });
    button.textContent = `${button.textContent.replace(/ [↑↓]$/, '')} ${state.desc ? '↓' : '↑'}`;
    renderTable();
  }));

  $$('#topicRail button').forEach((button) => button.addEventListener('click', () => {
    state.tag = button.dataset.tag;
    state.page = 1;
    $('#tagFilter').value = state.tag;
    renderTable();
    $('#records').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`已筛选题型 · ${state.tag}`);
  }));

  $$('#calendarView button').forEach((button) => button.addEventListener('click', () => {
    state.calendarView = button.dataset.view;
    $$('#calendarView button').forEach((item) => item.classList.toggle('is-active', item === button));
    renderCalendar();
  }));
  $$('.calendar-step').forEach((button) => button.addEventListener('click', () => {
    const step = Number(button.dataset.step);
    if (state.calendarView === 'year') state.calendarYear += step;
    else {
      state.calendarMonth += step;
      if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear -= 1; }
      if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear += 1; }
    }
    renderCalendar();
  }));

  $('#yearSelect').addEventListener('change', (event) => {
    const value = event.target.value;
    showToast(value === 'all' ? '已切换至全部年份' : `已切换至 ${value} 年`);
  });

  $('#syncButton').addEventListener('click', () => {
    const button = $('#syncButton');
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('is-syncing');
    button.querySelector('span').textContent = '同步中';
    window.setTimeout(() => {
      button.disabled = false;
      button.classList.remove('is-syncing');
      button.querySelector('span').textContent = '同步数据';
      $('#lastSync').textContent = '最后同步 · 刚刚';
      showToast('数据已更新 · 本地预览');
    }, 900);
  });
}

renderPlans();
renderTable();
renderCalendar();
bindEvents();
