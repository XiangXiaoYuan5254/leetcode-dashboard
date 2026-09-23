#!/usr/bin/env node
'use strict';

/**
 * 从灵茶山艾府「如何科学刷题」的核心刷题路线生成三个内置题单（按难度分拆分）。
 *
 * 口径：
 * - 只取路线表里各步的「必做内容」章节：滑窗（定长/不定长）→ 二分查找 → 数据结构（枚举技巧/前缀和/栈/队列/堆）
 *   → 二叉树 DFS（§2.1–§2.12）→ 网格图 DFS → 回溯 → 动态规划前六章；
 * - 不含会员题和标题带「选做」的小节；同一道题在多个章节出现时只保留第一次；
 * - 难度分优先取题单里写的数字（含「约 1700」这类估计值），题单没写的用 zerotrac 周赛难度分补齐，
 *   两边都没有的是非周赛题，归入「无难度分」。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'builtin-plans.json');
const SOURCE_URL = 'https://leetcode.cn/discuss/post/3141566/ru-he-ke-xue-shua-ti-by-endlesscheng-q3yd/';
const RATING_URL = 'https://zerotrac.github.io/leetcode_problem_rating/data.json';
const RATING_LIMIT = 1700;
const UA = 'Mozilla/5.0';

// 路线表顺序；h2 为章节标题前缀，maxSection 限定只取 §x.1 ~ §x.maxSection
const STEPS = [
  { post: '0viNMK', topic: '滑动窗口', chapters: [
    { h2: '一、', name: '定长滑动窗口' },
    { h2: '二、', name: '不定长滑动窗口' },
  ] },
  { post: 'SqopEo', topic: '二分算法', chapters: [{ h2: '一、', name: '二分查找' }] },
  { post: 'mOr1u6', topic: '数据结构', chapters: [
    { h2: '零、', name: '常用枚举技巧' },
    { h2: '一、', name: '前缀和' },
    { h2: '三、', name: '栈' },
    { h2: '四、', name: '队列' },
    { h2: '五、', name: '堆' },
  ] },
  { post: 'K0n2gO', topic: '链表树回溯', chapters: [{ h2: '二、', name: '二叉树 DFS', maxSection: 12 }] },
  { post: 'YiXPXW', topic: '网格图', chapters: [{ h2: '一、', name: '网格图 DFS' }] },
  { post: 'K0n2gO', topic: '链表树回溯', chapters: [{ h2: '四、', name: '回溯' }] },
  { post: 'tXLS3i', topic: '动态规划', chapters: [
    { h2: '一、', name: '入门 DP' },
    { h2: '二、', name: '网格图 DP' },
    { h2: '三、', name: '背包' },
    { h2: '四、', name: '经典线性 DP' },
    { h2: '五、', name: '划分型 DP' },
    { h2: '六、', name: '状态机 DP' },
  ] },
];

const COMMON_NOTE = '按灵神「如何科学刷题」核心路线的必做内容整理（滑窗 → 二分查找 → 数据结构 → 二叉树 DFS → 网格图 DFS → 回溯 → DP 前六章），'
  + '不含会员题和「选做」小节，跨章节重复的题只保留第一次出现。';

const PLANS = [
  {
    slug: 'lingshen-le1700',
    name: '灵神题单 · 难度分 ≤1700',
    note: `${COMMON_NOTE}难度分取自题单，题单没写的用 zerotrac 周赛难度分补齐。`,
    match: (q) => q.rating !== null && q.rating <= RATING_LIMIT,
  },
  {
    slug: 'lingshen-unrated',
    name: '灵神题单 · 无难度分',
    note: `${COMMON_NOTE}这里是没有难度分的非周赛题（如 3、643、144）。`,
    match: (q) => q.rating === null,
  },
  {
    slug: 'lingshen-gt1700',
    name: '灵神题单 · 难度分 >1700',
    note: `${COMMON_NOTE}难度分取自题单，题单没写的用 zerotrac 周赛难度分补齐。`,
    match: (q) => q.rating !== null && q.rating > RATING_LIMIT,
  },
];

const LINE_RE = /^\s*- \[((?:\d+|LCP \d+|LCR \d+|LCS \d+|面试题 [\d.]+))\. ([^\]]*)\]\(https:\/\/leetcode\.cn\/problems\/([^/)]+)(?:\/[^)]*)?\)(.*)$/;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

// 讨论帖正文在 __NEXT_DATA__ 的 qaQuestion.content（Markdown）
async function fetchPostMarkdown(id) {
  const html = await fetchText(`https://leetcode.cn/circle/discuss/${id}/`);
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`帖子 ${id} 没有 __NEXT_DATA__`);
  const queries = JSON.parse(m[1]).props.pageProps.dehydratedState.queries;
  for (const q of queries) {
    const post = q.state && q.state.data && q.state.data.qaQuestion;
    if (post && post.content) return post.content;
  }
  throw new Error(`帖子 ${id} 没有正文`);
}

function parseProblems(markdown) {
  const out = [];
  const heads = ['', '', ''];
  let inCode = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = /^(#{2,4}) (.*)/.exec(line);
    if (h) {
      const level = h[1].length - 2;
      heads[level] = h[2].trim();
      for (let i = level + 1; i < 3; i++) heads[i] = '';
      continue;
    }
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const rest = m[4].trim();
    // 右侧数字即难度分；「约 1700」这类估计值同样采用
    const r = /^(约\s*)?(\d{3,4})\b/.exec(rest) || /约\s*(\d{4})/.exec(rest);
    out.push({
      id: m[1],
      title: m[2],
      slug: m[3],
      rating: r ? Number(r[r.length - 1]) : null,
      ratingApprox: !!(r && r[0].includes('约')),
      member: rest.includes('会员题'),
      optional: heads.some((x) => x.includes('选做')),
      h2: heads[0],
      h3: heads[1],
    });
  }
  return out;
}

function inChapter(p, chapter) {
  if (!p.h2.startsWith(chapter.h2)) return false;
  if (!chapter.maxSection) return true;
  const m = /^§\d+\.(\d+)/.exec(p.h3);
  return !!m && Number(m[1]) <= chapter.maxSection;
}

async function main() {
  const catalogFile = path.join(ROOT, 'data', 'problems.json');
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')).questions || {};

  const zerotrac = new Map(
    JSON.parse(await fetchText(RATING_URL)).map((r) => [r.TitleSlug, Math.round(r.Rating)])
  );

  const posts = new Map();
  for (const step of STEPS) {
    if (posts.has(step.post)) continue;
    posts.set(step.post, parseProblems(await fetchPostMarkdown(step.post)));
    console.log(`帖子 ${step.post}：${posts.get(step.post).length} 道题`);
  }

  // 同一道题的难度分：题单里写的精确值（任意一处）> zerotrac > 题单里的「约 xxxx」估计值。
  // 估计值有时是针对该章节做法给的（如 1031 在枚举章节标「约 2000」，实际周赛分 1680），只在别无来源时采用。
  const exactRating = new Map();
  const approxRating = new Map();
  for (const problems of posts.values()) {
    for (const p of problems) {
      if (p.rating === null) continue;
      const target = p.ratingApprox ? approxRating : exactRating;
      if (!target.has(p.slug)) target.set(p.slug, p.rating);
    }
  }
  const ratingOf = (slug) => {
    if (exactRating.has(slug)) return { rating: exactRating.get(slug) };
    if (zerotrac.has(slug)) return { rating: zerotrac.get(slug) };
    if (approxRating.has(slug)) return { rating: approxRating.get(slug), ratingApprox: true };
    return { rating: null };
  };

  const seen = new Set();
  const chapters = [];
  STEPS.forEach((step, i) => {
    for (const chapter of step.chapters) {
      const questions = [];
      for (const p of posts.get(step.post)) {
        if (p.member || p.optional || !inChapter(p, chapter) || seen.has(p.slug)) continue;
        seen.add(p.slug);
        const info = catalog[p.slug];
        if (!info) throw new Error(`题库目录中没有找到 slug: ${p.slug}（先在仪表盘同步一次以刷新题库）`);
        questions.push({ slug: p.slug, difficulty: info.difficulty, ...ratingOf(p.slug) });
      }
      chapters.push({ name: `${i + 1}. ${step.topic} · ${chapter.name}`, questions });
    }
  });

  const generatedAt = new Date().toISOString().slice(0, 10);
  const built = {};
  for (const spec of PLANS) {
    const groups = chapters
      .map((c) => {
        const questions = c.questions.filter(spec.match).map(({ slug, difficulty, rating, ratingApprox }) => ({
          slug,
          difficulty,
          ...(rating !== null ? { rating } : {}),
          ...(ratingApprox ? { ratingApprox } : {}),
        }));
        return { name: c.name, questionNum: questions.length, questions };
      })
      .filter((g) => g.questions.length > 0);
    built[spec.slug] = {
      slug: spec.slug,
      name: spec.name,
      questionNum: groups.reduce((n, g) => n + g.questionNum, 0),
      builtIn: true,
      sourceUrl: SOURCE_URL,
      sourceName: '如何科学刷题（灵茶山艾府）',
      note: `${spec.note}题单内容截至 ${generatedAt}。`,
      groups,
    };
    console.log(`${spec.name}：${built[spec.slug].questionNum} 道`);
  }
  console.log(`合计 ${seen.size} 道`);

  const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  existing.plans = { ...existing.plans, ...built };
  fs.writeFileSync(OUT_FILE, JSON.stringify(existing, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
