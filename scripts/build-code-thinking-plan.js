#!/usr/bin/env node
'use strict';

/**
 * 从 B 站合集快照生成内置「代码随想录」课程题库。
 *
 * 口径：
 * - 合集中的每一期视频都保留在 lessons 中，顺序与 B 站一致；
 * - questions 只放视频明确讲解的力扣题；
 * - 图论课程以卡码网 ACM 题为主，仅将相近的力扣题标为 relatedQuestions，
 *   不混入力扣完成率。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BVID = 'BV1fA4y1o715';
const SOURCE_URL = `https://www.bilibili.com/video/${BVID}/`;
const API_URL = `https://api.bilibili.com/x/web-interface/view?bvid=${BVID}`;

const groupSpecs = [
  {
    name: '数组',
    mappings: [
      ['binary-search'],
      ['remove-element'],
      ['squares-of-a-sorted-array'],
      ['minimum-size-subarray-sum'],
      ['spiral-matrix-ii'],
    ],
  },
  {
    name: '链表',
    mappings: [
      ['remove-linked-list-elements'],
      ['design-linked-list'],
      ['reverse-linked-list'],
      ['swap-nodes-in-pairs'],
      ['remove-nth-node-from-end-of-list'],
      ['linked-list-cycle-ii'],
    ],
  },
  {
    name: '哈希表',
    mappings: [
      ['valid-anagram'],
      ['intersection-of-two-arrays'],
      ['two-sum'],
      ['4sum-ii'],
      ['3sum'],
      ['4sum'],
    ],
  },
  {
    name: '字符串',
    mappings: [
      ['reverse-string'],
      ['reverse-string-ii'],
      ['reverse-words-in-a-string'],
      ['find-the-index-of-the-first-occurrence-in-a-string'],
      ['find-the-index-of-the-first-occurrence-in-a-string'],
      ['repeated-substring-pattern'],
    ],
  },
  {
    name: '栈与队列',
    mappings: [
      ['implement-queue-using-stacks'],
      ['implement-stack-using-queues'],
      ['valid-parentheses'],
      ['remove-all-adjacent-duplicates-in-string'],
      ['evaluate-reverse-polish-notation'],
      ['sliding-window-maximum'],
      ['top-k-frequent-elements'],
    ],
  },
  {
    name: '二叉树',
    mappings: [
      [],
      ['binary-tree-preorder-traversal', 'binary-tree-postorder-traversal', 'binary-tree-inorder-traversal'],
      ['binary-tree-preorder-traversal', 'binary-tree-inorder-traversal'],
      ['binary-tree-inorder-traversal'],
      ['binary-tree-level-order-traversal'],
      ['invert-binary-tree'],
      ['symmetric-tree'],
      ['maximum-depth-of-binary-tree'],
      ['minimum-depth-of-binary-tree'],
      ['count-complete-tree-nodes'],
      ['balanced-binary-tree'],
      ['binary-tree-paths'],
      ['sum-of-left-leaves'],
      ['find-bottom-left-tree-value'],
      ['path-sum'],
      ['construct-binary-tree-from-inorder-and-postorder-traversal'],
      ['maximum-binary-tree'],
      ['merge-two-binary-trees'],
      ['search-in-a-binary-search-tree'],
      ['validate-binary-search-tree'],
      ['minimum-absolute-difference-in-bst'],
      ['find-mode-in-binary-search-tree'],
      ['lowest-common-ancestor-of-a-binary-tree'],
      ['lowest-common-ancestor-of-a-binary-search-tree'],
      ['insert-into-a-binary-search-tree'],
      ['delete-node-in-a-bst'],
      ['trim-a-binary-search-tree'],
      ['convert-sorted-array-to-binary-search-tree'],
      ['convert-bst-to-greater-tree'],
    ],
  },
  {
    name: '回溯算法',
    mappings: [
      [],
      ['combinations'],
      ['combinations'],
      ['combination-sum-iii'],
      ['letter-combinations-of-a-phone-number'],
      ['combination-sum'],
      ['combination-sum-ii'],
      ['palindrome-partitioning'],
      ['restore-ip-addresses'],
      ['subsets'],
      ['subsets-ii'],
      ['non-decreasing-subsequences'],
      ['permutations'],
      ['permutations-ii'],
      ['n-queens'],
      ['sudoku-solver'],
    ],
  },
  {
    name: '贪心算法',
    mappings: [
      [],
      ['assign-cookies'],
      ['wiggle-subsequence'],
      ['maximum-subarray'],
      ['best-time-to-buy-and-sell-stock-ii'],
      ['jump-game'],
      ['jump-game-ii'],
      ['maximize-sum-of-array-after-k-negations'],
      ['gas-station'],
      ['candy'],
      ['lemonade-change'],
      ['queue-reconstruction-by-height'],
      ['minimum-number-of-arrows-to-burst-balloons'],
      ['non-overlapping-intervals'],
      ['partition-labels'],
      ['merge-intervals'],
      ['monotone-increasing-digits'],
      ['binary-tree-cameras'],
    ],
  },
  {
    name: '动态规划',
    mappings: [
      [],
      ['fibonacci-number'],
      ['climbing-stairs'],
      ['min-cost-climbing-stairs'],
      ['unique-paths'],
      ['unique-paths-ii'],
      ['integer-break'],
      ['unique-binary-search-trees'],
      [],
      [],
      ['partition-equal-subset-sum'],
      ['last-stone-weight-ii'],
      ['target-sum'],
      ['ones-and-zeroes'],
      [],
      ['coin-change-ii'],
      ['combination-sum-iv'],
      ['coin-change'],
      ['perfect-squares'],
      ['word-break'],
      ['house-robber'],
      ['house-robber-ii'],
      ['house-robber-iii'],
      ['best-time-to-buy-and-sell-stock'],
      ['best-time-to-buy-and-sell-stock-ii'],
      ['best-time-to-buy-and-sell-stock-iii'],
      ['best-time-to-buy-and-sell-stock-iv'],
      ['best-time-to-buy-and-sell-stock-with-cooldown'],
      ['best-time-to-buy-and-sell-stock-with-transaction-fee'],
      ['longest-increasing-subsequence'],
      ['longest-continuous-increasing-subsequence'],
      ['maximum-length-of-repeated-subarray'],
      ['longest-common-subsequence'],
      ['uncrossed-lines'],
      ['maximum-subarray'],
      ['is-subsequence'],
      ['distinct-subsequences'],
      ['delete-operation-for-two-strings'],
      ['edit-distance'],
      ['palindromic-substrings'],
      ['longest-palindromic-subsequence'],
    ],
  },
  {
    name: '单调栈',
    mappings: [
      ['daily-temperatures'],
      ['next-greater-element-i'],
      ['next-greater-element-ii'],
      ['trapping-rain-water'],
      ['largest-rectangle-in-histogram'],
    ],
  },
];

// 图论视频主要对应卡码网 ACM 题；这里只给出相近的力扣练习，不算作精确映射。
const graphRelated = [
  [],
  [],
  [],
  ['all-paths-from-source-to-target'],
  [],
  ['number-of-islands'],
  ['number-of-islands'],
  ['max-area-of-island'],
  ['number-of-enclaves'],
  ['surrounded-regions'],
  ['pacific-atlantic-water-flow'],
  ['making-a-large-island'],
  ['island-perimeter'],
  ['word-ladder'],
  ['keys-and-rooms'],
  [],
  ['find-if-path-exists-in-graph'],
  ['redundant-connection'],
  ['redundant-connection-ii'],
  ['min-cost-to-connect-all-points'],
  ['min-cost-to-connect-all-points'],
  ['course-schedule', 'course-schedule-ii'],
  ['network-delay-time'],
  ['network-delay-time'],
  ['network-delay-time'],
  ['network-delay-time'],
  [],
  ['cheapest-flights-within-k-stops'],
  ['find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance'],
  ['minimum-knight-moves'],
];

function lessonOf(ep, index, questionSlugs = [], relatedQuestionSlugs = []) {
  return {
    index,
    title: ep.title,
    bvid: ep.bvid,
    videoUrl: `https://www.bilibili.com/video/${ep.bvid}/`,
    questionSlugs,
    relatedQuestionSlugs,
  };
}

function questionsFromLessons(lessons, catalog) {
  const order = [];
  const videosBySlug = new Map();
  for (const lesson of lessons) {
    for (const slug of lesson.questionSlugs) {
      if (!videosBySlug.has(slug)) {
        order.push(slug);
        videosBySlug.set(slug, []);
      }
      videosBySlug.get(slug).push({ title: lesson.title, url: lesson.videoUrl });
    }
  }
  return order.map((slug) => {
    const q = catalog[slug];
    if (!q) throw new Error(`题库目录中没有找到 slug: ${slug}`);
    return {
      slug,
      difficulty: q.difficulty,
      videos: videosBySlug.get(slug),
    };
  });
}

async function main() {
  const response = await fetch(API_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`B 站接口 HTTP ${response.status}`);
  const json = await response.json();
  if (json.code !== 0) throw new Error(`B 站接口错误: ${json.message}`);

  const season = json.data && json.data.ugc_season;
  const episodes = (season && season.sections || []).flatMap((section) => section.episodes || []);
  if (episodes.length !== 170) {
    throw new Error(`合集期数已变化：预期 170，实际 ${episodes.length}，请先人工复核映射`);
  }

  const catalogFile = path.join(ROOT, 'data', 'problems.json');
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')).questions || {};

  let cursor = 0;
  const basicGroups = groupSpecs.map((spec) => {
    const eps = episodes.slice(cursor, cursor + spec.mappings.length);
    if (eps.length !== spec.mappings.length) throw new Error(`「${spec.name}」视频数量不足`);
    const lessons = eps.map((ep, i) => lessonOf(ep, cursor + i + 1, spec.mappings[i]));
    cursor += spec.mappings.length;
    const questions = questionsFromLessons(lessons, catalog);
    return {
      name: spec.name,
      questionNum: questions.length,
      videoCount: lessons.length,
      questions,
      lessons,
    };
  });

  if (cursor !== 139) throw new Error(`基础专题切片错误：预期前 139 期，实际 ${cursor}`);

  const summaryLesson = lessonOf(episodes[cursor], cursor + 1);
  cursor += 1;
  const summaryGroup = {
    name: '课程总结',
    questionNum: 0,
    videoCount: 1,
    questions: [],
    lessons: [summaryLesson],
  };

  const graphEpisodes = episodes.slice(cursor);
  if (graphEpisodes.length !== 30 || graphRelated.length !== 30) {
    throw new Error(`图论映射数量异常：视频 ${graphEpisodes.length}，映射 ${graphRelated.length}`);
  }
  const graphLessons = graphEpisodes.map((ep, i) =>
    lessonOf(ep, cursor + i + 1, [], graphRelated[i])
  );
  const graphGroup = {
    name: '图论（卡码网 ACM）',
    questionNum: 0,
    videoCount: graphLessons.length,
    questions: [],
    lessons: graphLessons,
  };

  const allGroups = [...basicGroups, summaryGroup, graphGroup];
  const exactQuestions = basicGroups.flatMap((group) => group.questions);
  const uniqueExact = new Set(exactQuestions.map((q) => q.slug));
  const problemVideoCount = basicGroups
    .flatMap((group) => group.lessons)
    .filter((lesson) => lesson.questionSlugs.length > 0).length;

  const plan = {
    slug: 'code-thinking',
    name: '代码随想录',
    questionNum: uniqueExact.size,
    questionOccurrences: exactQuestions.length,
    videoCount: episodes.length,
    builtIn: true,
    sourceUrl: SOURCE_URL,
    sourceName: season.title,
    sourceStats: {
      videoCount: episodes.length,
      basicVideoCount: 140,
      graphVideoCount: 30,
      problemVideoCount,
      basicTheoryOrSummaryVideoCount: 140 - problemVideoCount,
      uniqueLeetcodeQuestionCount: uniqueExact.size,
      groupQuestionOccurrenceCount: exactQuestions.length,
    },
    groups: allGroups,
  };

  const outFile = path.join(ROOT, 'builtin-plans.json');
  fs.writeFileSync(outFile, JSON.stringify({ plans: { 'code-thinking': plan } }, null, 2) + '\n');
  console.log(JSON.stringify(plan.sourceStats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
