#!/usr/bin/env node
'use strict';

/**
 * 力扣刷题统计 - 本地服务
 * 零依赖 Node 服务：托管前端页面，并从 leetcode.cn 拉取提交记录与题库目录。
 * 数据保存在 ./data/ 目录（含登录凭证，请勿外传该目录）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5877);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const FILES = {
  config: path.join(DATA_DIR, 'config.json'),
  submissions: path.join(DATA_DIR, 'submissions.json'),
  problems: path.join(DATA_DIR, 'problems.json'),
  plans: path.join(DATA_DIR, 'plans.json'),
  meta: path.join(DATA_DIR, 'meta.json'),
};
const SITE = 'https://leetcode.cn';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE_LIMIT = 40;
const MAX_PAGES = 1000;
// 提交列表接口限流较狠：请求过快会返回不含 submissions_dump 的空响应（并非到底），必须放慢并重试
const REQUEST_GAP_MS = 1500;
// 题库目录（题目难度/标签/slug）变化极慢，缓存 30 天，日常增量同步不再全量重拉；
// 若做了目录里还没有的新题，resolve 阶段发现标题匹配不上会自动刷新目录兜底。
const CATALOG_TTL_MS = 30 * 24 * 3600 * 1000;
const PLAN_TTL_MS = 7 * 24 * 3600 * 1000; // 题单详情缓存 7 天
const DEFAULT_PLANS = ['programming-skills', 'top-100-liked'];

// ---------- 小工具 ----------

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (e && e.fatal) throw e;
      await sleep(2500 * (i + 1)); // 被限流时退避等待
    }
  }
  throw lastErr;
}

function baseHeaders(cookie) {
  const m = /(?:^|;\s*)csrftoken=([^;]+)/.exec(cookie || '');
  return {
    cookie: cookie,
    'user-agent': UA,
    referer: SITE + '/',
    origin: SITE,
    ...(m ? { 'x-csrftoken': decodeURIComponent(m[1]) } : {}),
  };
}

// ---------- 力扣接口 ----------

async function gql(cookie, query, variables) {
  const res = await fetch(SITE + '/graphql/', {
    method: 'POST',
    headers: { ...baseHeaders(cookie), 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    const err = new Error(`力扣接口返回异常（HTTP ${res.status}），登录状态可能已失效`);
    if (res.status === 403 || res.status === 401) err.fatal = true;
    throw err;
  }
  if (json.errors && json.errors.length) {
    throw new Error('力扣接口错误: ' + json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function fetchUserStatus(cookie) {
  const data = await gql(cookie, 'query { userStatus { isSignedIn username } }', {});
  return (data && data.userStatus) || { isSignedIn: false };
}

// --- 提交记录（REST 优先，GraphQL 兜底；两者都不含题目 slug，slug 由题库目录按标题解析） ---

function normalizeRestSubmission(s) {
  return {
    id: String(s.id),
    slug: s.title_slug || null,
    title: s.title || '',
    status: s.status_display || '',
    lang: s.lang || '',
    ts: Number(s.timestamp) || 0,
  };
}

async function fetchSubmissionPageREST(cookie, offset, lastKey) {
  const u = `${SITE}/api/submissions/?offset=${offset}&limit=${PAGE_LIMIT}&lastkey=${encodeURIComponent(lastKey || '')}`;
  const res = await fetch(u, { headers: baseHeaders(cookie) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    const err = new Error(`提交列表接口返回异常（HTTP ${res.status}），登录状态可能已失效`);
    if (res.status === 403 || res.status === 401) err.fatal = true;
    throw err;
  }
  // 限流时会返回不含 submissions_dump 的响应体，抛错交给 withRetry 退避重试，
  // 否则会被误判为“没有更多数据”而丢失历史提交
  if (!('submissions_dump' in json)) {
    throw new Error(`提交列表被限流（HTTP ${res.status}），稍后重试`);
  }
  return {
    submissions: json.submissions_dump.map(normalizeRestSubmission),
    hasNext: !!json.has_next,
    lastKey: json.last_key || null,
  };
}

const GQL_SUBMISSIONS = `query submissionList($offset: Int!, $limit: Int!, $lastKey: String) {
  submissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
    lastKey
    hasNext
    submissions { id title statusDisplay lang timestamp }
  }
}`;

async function fetchSubmissionPageGQL(cookie, offset, lastKey) {
  const data = await gql(cookie, GQL_SUBMISSIONS, { offset, limit: PAGE_LIMIT, lastKey });
  const list = data && data.submissionList;
  if (!list) throw new Error('submissionList 返回为空');
  return {
    submissions: (list.submissions || []).map((s) => ({
      id: String(s.id),
      slug: null,
      title: s.title || '',
      status: s.statusDisplay || '',
      lang: s.lang || '',
      ts: Number(s.timestamp) || 0,
    })),
    hasNext: !!list.hasNext,
    lastKey: list.lastKey || null,
  };
}

let submissionApi = null; // 'rest' | 'gql'
async function fetchSubmissionPage(cookie, offset, lastKey) {
  if (submissionApi === 'rest') return fetchSubmissionPageREST(cookie, offset, lastKey);
  if (submissionApi === 'gql') return fetchSubmissionPageGQL(cookie, offset, lastKey);
  try {
    const page = await fetchSubmissionPageREST(cookie, offset, lastKey);
    submissionApi = 'rest';
    return page;
  } catch (e) {
    if (e.fatal) throw e;
    const page = await fetchSubmissionPageGQL(cookie, offset, lastKey);
    submissionApi = 'gql';
    return page;
  }
}

// --- 题库目录：一次拉全，包含 中文标题 / slug / 难度 / 标签 ---

const GQL_PROBLEMSET = `query problemsetQuestionList($categorySlug: String, $skip: Int, $limit: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList(categorySlug: $categorySlug, skip: $skip, limit: $limit, filters: $filters) {
    hasMore
    questions {
      difficulty
      frontendQuestionId
      title
      titleCn
      titleSlug
      topicTags { name nameTranslated slug }
    }
  }
}`;

const DIFF_MAP = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

async function fetchCatalog(cookie, onProgress) {
  const questions = {};
  let skip = 0;
  const limit = 100;
  for (let page = 0; page < 200; page++) {
    const data = await withRetry(() => gql(cookie, GQL_PROBLEMSET, { categorySlug: '', skip, limit, filters: {} }));
    const node = data && data.problemsetQuestionList;
    const qs = (node && node.questions) || [];
    for (const q of qs) {
      if (!q.titleSlug) continue;
      questions[q.titleSlug] = {
        slug: q.titleSlug,
        frontendId: q.frontendQuestionId || '',
        title: q.title || '',
        translatedTitle: q.titleCn || q.title || '',
        difficulty: DIFF_MAP[q.difficulty] || q.difficulty || 'Unknown',
        tags: (q.topicTags || []).map((t) => ({
          slug: t.slug, name: t.name, translatedName: t.nameTranslated || t.name,
        })),
      };
    }
    if (onProgress) onProgress(Object.keys(questions).length);
    if (!node || !node.hasMore || qs.length === 0) break;
    skip += limit;
    await sleep(250);
  }
  return questions;
}

// 标题 -> 候选 slug 集合。力扣有大量中文同名题（如 242 与 LCR 032 都叫「有效的字母异位词」），
// 提交列表接口只给中文标题，故同名标题会对应多个 slug，无法仅凭标题区分。
function buildTitleIndex(questions) {
  const map = new Map();
  const add = (t, slug) => {
    if (!t) return;
    if (!map.has(t)) map.set(t, new Set());
    map.get(t).add(slug);
  };
  for (const q of Object.values(questions)) { add(q.title, q.slug); add(q.translatedTitle, q.slug); }
  return map;
}

// 第一步：能用标题唯一确定的直接定 slug；同名题清空 slug 并收集起来，交给详情接口逐条精确解析。
// slugSrc='detail' 表示已由提交详情确认，最可信，永不回退为标题猜测。
function resolveByTitle(submissions, titleMap) {
  const ambiguous = [];
  let unresolved = 0;
  for (const s of submissions) {
    if (s.slugSrc === 'detail' && s.slug) continue; // 已精确确认
    const cands = titleMap.get(s.title);
    if (!cands || cands.size === 0) { s.slug = s.slug || null; if (!s.slug) unresolved++; continue; }
    if (cands.size === 1) { s.slug = [...cands][0]; s.slugSrc = 'title'; continue; }
    // 同名题：标题匹配不可信，清空等详情核对
    s.slug = null; delete s.slugSrc;
    ambiguous.push(s);
  }
  return { ambiguous, unresolved };
}

const GQL_SUBMISSION_DETAIL = `query submissionDetail($submissionId: ID!) {
  submissionDetail(submissionId: $submissionId) { question { titleSlug } }
}`;

// 按提交 id 查真实题目 slug（用于同名题精确归属）
async function fetchSubmissionSlug(cookie, id) {
  const data = await gql(cookie, GQL_SUBMISSION_DETAIL, { submissionId: String(id) });
  const q = data && data.submissionDetail && data.submissionDetail.question;
  return q ? q.titleSlug : null;
}

// --- 题单（官方 studyplan）---

const GQL_STUDY_PLAN = `query studyPlanV2Detail($planSlug: String!) {
  studyPlanV2Detail(planSlug: $planSlug) {
    slug
    name
    questionNum
    planSubGroups { name questionNum questions { titleSlug difficulty } }
  }
}`;

async function fetchPlanDetail(cookie, planSlug) {
  const data = await gql(cookie, GQL_STUDY_PLAN, { planSlug });
  const p = data && data.studyPlanV2Detail;
  if (!p) return null;
  return {
    slug: p.slug,
    name: p.name,
    questionNum: p.questionNum || 0,
    groups: (p.planSubGroups || []).map((g) => ({
      name: g.name,
      questionNum: g.questionNum || (g.questions || []).length,
      questions: (g.questions || []).map((q) => ({ slug: q.titleSlug, difficulty: DIFF_MAP[q.difficulty] || q.difficulty })),
    })),
    fetchedAt: Date.now(),
  };
}

function enabledPlanSlugs() {
  const config = readJson(FILES.config, {});
  return Array.isArray(config.plans) ? config.plans : DEFAULT_PLANS;
}

function readPlanCache() {
  const cache = readJson(FILES.plans, {});
  return cache.plans || {};
}

function writePlanCache(plans) {
  writeJson(FILES.plans, { plans });
}

// 从用户输入（slug 或题单页 URL）提取 slug
function parsePlanSlug(input) {
  const s = String(input || '').trim();
  const m = /studyplan\/([a-z0-9-]+)/i.exec(s);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9-]+$/i.test(s) ? s.toLowerCase() : null;
}

// --- 账号密码登录 ---

function collectCookies(res, jar = new Map()) {
  const arr = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  for (const line of arr) {
    const m = /^([^=;]+)=([^;]*)/.exec(String(line));
    if (m && m[2] !== '' && m[2] !== '""') jar.set(m[1].trim(), m[2]);
  }
  return jar;
}
const jarToCookie = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function extractFormErrors(j) {
  const msgs = [];
  const form = j && j.form;
  if (form) {
    for (const arr of [form.errors, ...(form.fields ? Object.values(form.fields).map((f) => f.errors) : [])]) {
      if (Array.isArray(arr)) for (const m of arr) if (m) msgs.push(String(m));
    }
  }
  return msgs.join('；');
}

async function loginWithPassword(username, password) {
  // 1. 匿名请求换取 csrftoken 等基础 Cookie
  const r1 = await fetch(SITE + '/graphql/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, origin: SITE, referer: SITE + '/' },
    body: JSON.stringify({ query: 'query { userStatus { isSignedIn } }', variables: {} }),
  });
  const jar = collectCookies(r1);
  const csrf = jar.get('csrftoken');
  if (!csrf) throw new Error('无法获取登录令牌，请稍后重试');

  // 2. 提交账号密码
  const form = new URLSearchParams({ login: username, password });
  const r2 = await fetch(SITE + '/accounts/login/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
      origin: SITE,
      referer: SITE + '/accounts/login/',
      cookie: jarToCookie(jar),
      'x-csrftoken': csrf,
      'x-requested-with': 'XMLHttpRequest',
    },
    body: form.toString(),
    redirect: 'manual',
  });
  collectCookies(r2, jar);

  if (!jar.get('LEETCODE_SESSION')) {
    let msg = '';
    try { msg = extractFormErrors(JSON.parse(await r2.text())); } catch { /* 非 JSON 响应 */ }
    if (/验证码|captcha/i.test(msg)) {
      throw new Error('力扣要求图形验证码，暂无法直接登录，请改用 Cookie 方式');
    }
    throw new Error(msg || `登录失败（HTTP ${r2.status}），请检查账号密码，或改用 Cookie 方式`);
  }

  const cookie = jarToCookie(jar);
  const status = await fetchUserStatus(cookie);
  if (!status.isSignedIn) throw new Error('登录未生效，请改用 Cookie 方式');
  return { cookie, username: status.username || username };
}

function saveCredential(cookie, username) {
  const config = readJson(FILES.config, {});
  config.cookie = cookie;
  writeJson(FILES.config, config);
  const meta = readJson(FILES.meta, {});
  meta.username = username || '';
  writeJson(FILES.meta, meta);
}

// ---------- 同步任务 ----------

let syncState = {
  running: false,
  phase: 'idle', // idle | catalog | submissions | resolve | done | error
  message: '',
  added: 0,
  error: null,
};

async function runSync() {
  const config = readJson(FILES.config, {});
  if (!config.cookie) throw new Error('尚未登录');
  syncState = { running: true, phase: 'catalog', message: '正在检查题库目录…', added: 0, error: null };

  // 1. 题库目录（过期则刷新）
  let catalog = readJson(FILES.problems, null);
  let catalogFresh = false;
  const refreshCatalog = async () => {
    syncState.phase = 'catalog';
    const questions = await fetchCatalog(config.cookie, (n) => {
      syncState.message = `正在更新题库目录…已获取 ${n} 题`;
    });
    catalog = { fetchedAt: Date.now(), questions };
    writeJson(FILES.problems, catalog);
    catalogFresh = true;
  };
  if (!catalog || !catalog.questions || (Date.now() - (catalog.fetchedAt || 0)) > CATALOG_TTL_MS) {
    await refreshCatalog();
  }

  // 2. 拉取提交记录。历史版本曾把限流误判为“到底”导致漏数据，
  //    因此在完成过一次完整拉取（meta.fullSyncV2）之前不做增量截断
  syncState.phase = 'submissions';
  syncState.message = '正在拉取提交记录…';
  const meta0 = readJson(FILES.meta, {});
  const existing = readJson(FILES.submissions, []);
  const byId = new Map(existing.map((s) => [s.id, s]));
  const incremental = byId.size > 0 && meta0.fullSyncV2 === true;
  let offset = 0, lastKey = null, pages = 0, stop = false;
  while (!stop && pages < MAX_PAGES) {
    const page = await withRetry(() => fetchSubmissionPage(config.cookie, offset, lastKey));
    pages++;
    let hitKnown = false;
    for (const s of page.submissions) {
      if (byId.has(s.id)) { hitKnown = true; continue; }
      byId.set(s.id, s);
      syncState.added++;
    }
    syncState.message = `正在拉取提交记录…已获取 ${pages} 页，新增 ${syncState.added} 条`;
    // 列表按时间倒序：完整拉取过一次之后，遇到已知提交即可停止（更早的都已同步）
    if ((incremental && hitKnown) || !page.hasNext || page.submissions.length === 0) stop = true;
    offset += PAGE_LIMIT;
    lastKey = page.lastKey;
    if (!stop) await sleep(REQUEST_GAP_MS);
  }

  // 3. 解析题目 slug：先按标题（唯一即定），同名题再逐条查提交详情精确归属
  syncState.phase = 'resolve';
  syncState.message = '正在匹配题目信息…';
  const all = [...byId.values()].sort((a, b) => b.ts - a.ts);
  let { ambiguous, unresolved } = resolveByTitle(all, buildTitleIndex(catalog.questions));
  // 有标题在目录里找不到（新题上线而目录旧），强制刷新目录再试一次
  if (unresolved > 0 && !catalogFresh) {
    await refreshCatalog();
    ({ ambiguous, unresolved } = resolveByTitle(all, buildTitleIndex(catalog.questions)));
  }
  // 同名题：逐条查提交详情拿真实 slug（结果记为 detail，永久缓存，增量时不再重复查）
  if (ambiguous.length) {
    let done = 0;
    for (const s of ambiguous) {
      try {
        // 详情接口限流时会返回空（question=null），视作可重试而非放弃
        const slug = await withRetry(async () => {
          const sl = await fetchSubmissionSlug(config.cookie, s.id);
          if (!sl) throw new Error('详情暂无返回（可能被限流）');
          return sl;
        }, 4);
        s.slug = slug; s.slugSrc = 'detail';
      } catch (e) {
        console.error(`提交详情解析失败 id=${s.id}: ${e.message}`);
      }
      done++;
      syncState.message = `正在核对同名题目…${done}/${ambiguous.length}`;
      if (done % 5 === 0) writeJson(FILES.submissions, all); // 增量落盘，中断可续
      await sleep(REQUEST_GAP_MS);
    }
    unresolved = all.filter((s) => !s.slug).length;
  }
  writeJson(FILES.submissions, all);

  // 4. 刷新已启用题单的详情（新启用 / 过期的才拉）
  syncState.phase = 'plans';
  const planCache = readPlanCache();
  for (const slug of enabledPlanSlugs()) {
    const cached = planCache[slug];
    if (cached && (Date.now() - (cached.fetchedAt || 0)) < PLAN_TTL_MS) continue;
    syncState.message = `正在更新题单「${slug}」…`;
    try {
      const detail = await withRetry(() => fetchPlanDetail(config.cookie, slug), 2);
      if (detail) planCache[slug] = detail;
    } catch (e) {
      console.error(`题单拉取失败 ${slug}: ${e.message}`);
    }
    await sleep(400);
  }
  writePlanCache(planCache);

  const meta = readJson(FILES.meta, {});
  meta.lastSync = Date.now();
  meta.fullSyncV2 = true; // 已完成一次完整拉取，后续可增量
  writeJson(FILES.meta, meta);

  syncState.running = false;
  syncState.phase = 'done';
  syncState.message = `同步完成：新增 ${syncState.added} 条提交，共 ${all.length} 条` +
    (unresolved ? `（${unresolved} 条未能匹配到题目）` : '');
}

function startSync() {
  if (syncState.running) return;
  runSync().catch((e) => {
    console.error('同步失败:', e);
    syncState.running = false;
    syncState.phase = 'error';
    syncState.error = e.message;
    syncState.message = '同步失败: ' + e.message;
  });
}

// ---------- HTTP 服务 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p === '/api/status' && req.method === 'GET') {
      const config = readJson(FILES.config, {});
      const meta = readJson(FILES.meta, {});
      const subs = readJson(FILES.submissions, []);
      return sendJson(res, 200, {
        hasCookie: !!config.cookie,
        username: meta.username || null,
        lastSync: meta.lastSync || null,
        submissionCount: subs.length,
        sync: syncState,
      });
    }
    if (p === '/api/data' && req.method === 'GET') {
      const catalog = readJson(FILES.problems, {});
      const planCache = readPlanCache();
      const config = readJson(FILES.config, {});
      const restarts = config.planRestarts || {};
      const plans = enabledPlanSlugs()
        .map((s) => planCache[s])
        .filter(Boolean)
        .map((d) => ({ ...d, restarts: restarts[d.slug] || [] }));
      return sendJson(res, 200, {
        submissions: readJson(FILES.submissions, []),
        problems: catalog.questions || {},
        plans,
        meta: readJson(FILES.meta, {}),
      });
    }
    // 重刷：记录一个重刷时间点，该题单进度从此刻重新计数（提交历史不受影响）
    if (p === '/api/plans/restart' && req.method === 'POST') {
      const body = await readBody(req);
      const slug = parsePlanSlug(body.slug);
      if (!slug) return sendJson(res, 400, { ok: false, error: '题单不存在' });
      const config = readJson(FILES.config, {});
      config.planRestarts = config.planRestarts || {};
      config.planRestarts[slug] = config.planRestarts[slug] || [];
      config.planRestarts[slug].push(Date.now());
      writeJson(FILES.config, config);
      return sendJson(res, 200, { ok: true, round: config.planRestarts[slug].length + 1 });
    }
    // 取消最近一次重刷，回到上一轮的计数
    if (p === '/api/plans/restart-cancel' && req.method === 'POST') {
      const body = await readBody(req);
      const slug = parsePlanSlug(body.slug);
      const config = readJson(FILES.config, {});
      if (config.planRestarts && Array.isArray(config.planRestarts[slug])) {
        config.planRestarts[slug].pop();
        writeJson(FILES.config, config);
      }
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/plans/add' && req.method === 'POST') {
      const body = await readBody(req);
      const slug = parsePlanSlug(body.slug);
      if (!slug) return sendJson(res, 400, { ok: false, error: '无法识别题单，请输入题单页链接或 slug' });
      const config = readJson(FILES.config, {});
      if (!config.cookie) return sendJson(res, 400, { ok: false, error: '请先登录力扣账号' });
      const planCache = readPlanCache();
      if (!planCache[slug]) {
        try {
          const detail = await fetchPlanDetail(config.cookie, slug);
          if (!detail) return sendJson(res, 404, { ok: false, error: `没有找到题单「${slug}」，请检查链接` });
          planCache[slug] = detail;
          writePlanCache(planCache);
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: '题单获取失败: ' + e.message });
        }
      }
      const slugs = enabledPlanSlugs();
      if (!slugs.includes(slug)) {
        config.plans = [...slugs, slug];
        writeJson(FILES.config, config);
      }
      return sendJson(res, 200, { ok: true, plan: planCache[slug] });
    }
    if (p === '/api/plans/remove' && req.method === 'POST') {
      const body = await readBody(req);
      const slug = parsePlanSlug(body.slug);
      const config = readJson(FILES.config, {});
      config.plans = enabledPlanSlugs().filter((s) => s !== slug);
      writeJson(FILES.config, config);
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return sendJson(res, 400, { ok: false, error: '请输入账号和密码' });
      try {
        const r = await loginWithPassword(username, password);
        saveCredential(r.cookie, r.username);
        return sendJson(res, 200, { ok: true, username: r.username });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message });
      }
    }
    if (p === '/api/cookie' && req.method === 'POST') {
      const body = await readBody(req);
      const cookie = String(body.cookie || '').trim().replace(/[\r\n]+/g, ' ');
      if (!cookie) return sendJson(res, 400, { ok: false, error: 'Cookie 不能为空' });
      let status;
      try { status = await fetchUserStatus(cookie); } catch (e) {
        return sendJson(res, 400, { ok: false, error: '验证失败: ' + e.message });
      }
      if (!status.isSignedIn) {
        return sendJson(res, 400, { ok: false, error: 'Cookie 未登录或已过期，请重新复制' });
      }
      saveCredential(cookie, status.username);
      return sendJson(res, 200, { ok: true, username: status.username });
    }
    if (p === '/api/sync' && req.method === 'POST') {
      const config = readJson(FILES.config, {});
      if (!config.cookie) return sendJson(res, 400, { ok: false, error: '请先登录力扣账号' });
      if (syncState.running) return sendJson(res, 200, { ok: true, alreadyRunning: true });
      startSync();
      return sendJson(res, 200, { ok: true });
    }

    // 静态文件
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, file);
    if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`力扣刷题统计已启动: http://${HOST}:${PORT}`);
});
