import assert from 'node:assert/strict';
import { littleText, nextApproved, validatePosts, validatePost, parseFeed, isPeak, llmCost, summarize, dashboardHtml, usd, validateReport, marketHtml, ideasHtml, pickTopics } from './src/lib.js';

assert.equal(littleText('Use a?.b (safe) #JavaScript'), 'Use a?.b \\(safe\\) {hashtag|\\#|JavaScript}');
assert.equal(littleText('x = [1] * 2_000'), 'x = \\[1\\] \\* 2\\_000');
assert.equal(
  nextApproved([
    { id: '2026-11-02-0', status: 'approved' },
    { id: '2026-11-01-2', status: 'approved' },
    { id: '2026-11-01-0', status: 'pending' },
  ]).id,
  '2026-11-01-2',
);
assert.equal(nextApproved([{ id: 'a', status: 'pending' }]), undefined);
assert.throws(() => validatePosts({ posts: [{ text: 'x' }] }));
assert.throws(() => validatePost({ kind: 'carousel', text: 'x', slides: [{}, {}] }), /3\+ slides/);
assert.ok(validatePost({ kind: 'tip', text: 'x', card: { title: 't' } }));

const topicsMd = '# AWS topics\nIntro line\n1. IAM roles\n2. S3 buckets\n3. Lambda\n4. DynamoDB\n';
assert.deepEqual(pickTopics(topicsMd), { topics: ['IAM roles', 'S3 buckets', 'Lambda'], next: 3 });
assert.deepEqual(pickTopics(topicsMd, 3), { topics: ['DynamoDB', 'IAM roles', 'S3 buckets'], next: 2 }); // wraps
assert.throws(() => pickTopics('1. only one'), /at least 3/);

const rss = `<rss><channel><title>Feed</title><item><title><![CDATA[Zepto raises $100M]]></title><link>https://x.in/a?b=1&amp;c=2</link>
<description>&lt;p&gt;Quick &amp;amp; big&lt;/p&gt;</description></item></channel></rss>`;
assert.deepEqual(parseFeed(rss), [{ title: 'Zepto raises $100M', url: 'https://x.in/a?b=1&c=2', text: 'Quick & big' }]);
const atom = `<feed><entry><title>App</title><link rel="alternate" href="https://ph.com/p/1"/><content type="html">&lt;b&gt;New&lt;/b&gt;</content></entry></feed>`;
assert.deepEqual(parseFeed(atom), [{ title: 'App', url: 'https://ph.com/p/1', text: 'New' }]);

const rep = validateReport({ headline: 'h', gaps: [{ title: 'g', url: 'https://real' }, { title: '<x>', url: 'https://made-up' }] }, new Set(['https://real']));
assert.deepEqual(rep.gaps.map((g) => g.url), ['https://real', null]);
assert.throws(() => validateReport({ gaps: [] }, new Set()));
const page = marketHtml({ date: '2026-11-02', ...rep, sources: ['Inc42'], failed: ['Reddit (HTTP 403)'] });
assert.ok(page.includes('<a href="https://real">g</a>') && page.includes('&lt;x&gt;') && page.includes('Reddit (HTTP 403)'));
const ideas = validateReport(
  { headline: 'h', ideas: [{ title: 'Cloud kitchen', url: 'https://real', cost: '₹2-5L', time: 'full-time' }], local: [{ title: 'l', url: 'https://fake' }], deepDive: { title: 'd' } },
  new Set(['https://real']),
  'ideas',
);
assert.deepEqual([ideas.ideas[0].url, ideas.local[0].url, ideas.deepDive.title], ['https://real', null, 'd']);
assert.throws(() => validateReport({ gaps: [{ title: 'x' }] }, new Set(), 'ideas'));
const ideasPage = ideasHtml({ date: '2026-11-02', ...ideas, sources: ['TechCrunch'], failed: [] }, { other: { title: 'Market report', href: 'https://app/r' } });
assert.ok(ideasPage.includes('₹2-5L') && ideasPage.includes('full-time') && ideasPage.includes('Deep dive: d') && ideasPage.includes('Market report'));
assert.ok(ideasPage.includes('<p>l: ') && !ideasPage.includes('https://fake') && !ideasPage.includes('Products to sell'));

// Usage dashboard
const wedPeak = new Date('2026-11-04T03:30:00Z'); // Wednesday 9 AM IST
const satNight = new Date('2026-11-07T03:30:00Z');
assert.ok(isPeak(wedPeak) && !isPeak(satNight) && !isPeak(new Date('2026-11-04T05:00:00Z')));
const u = { prompt_tokens: 1_000_000, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 1_000_000, completion_tokens: 1_000_000 };
assert.equal(llmCost('deepseek-flash', u, wedPeak).toFixed(2), '1.50');
assert.equal(llmCost('deepseek-flash', u, satNight).toFixed(2), '0.75');
assert.equal(llmCost('unknown', u, wedPeak), 0);
const s = summarize(
  {
    llm: [
      { date: '2026-11-05', job: 'draft', inTokens: 10, outTokens: 5, cost: 0.02 },
      { date: '2026-11-05', job: 'draft', inTokens: 10, outTokens: 5, cost: 0.01 },
    ],
    runs: [
      { sk: '2026-11-05T03:30:00Z#a', job: 'draft', ok: true, ms: 20000 },
      { sk: '2026-11-05T04:30:00Z#b', job: 'edit', ok: false, ms: 1000, error: '<b>x</b>' },
    ],
    aws: [{ sk: '2026-11-04', total: 0.5, services: { 'AWS Lambda': 0.4, 'Amazon S3': 0.1 } }],
    balance: { sk: '2026-11-05', amount: 8.1, currency: 'USD' },
  },
  '2026-11-05',
);
assert.equal(s.month.aws, 0.5);
assert.equal(s.month.llm.toFixed(2), '0.03');
assert.deepEqual(s.jobs.map((j) => [j.job, j.runs, j.failed, j.tokens]), [['draft', 1, 0, 30], ['edit', 1, 1, 0]]);
assert.equal(s.runs[0].job, 'edit');
const dash = dashboardHtml(s);
assert.ok(dash.includes('$0.530') && dash.includes('&lt;b&gt;x&lt;/b&gt;') && dash.includes('AWS Lambda'));
assert.ok(dashboardHtml(summarize({}, '2026-11-05')).includes('No data yet'));

// Other projects in the same table: split by agent, client and the AWS "project" tag
const p = summarize(
  {
    llm: [
      { date: '2026-11-05', job: 'draft', inTokens: 10, outTokens: 5, cost: 0.02 },
      { date: '2026-11-05', job: 'draftOne', agent: 'linkedin-service', client: 'asha-k3f9', inTokens: 100, outTokens: 50, cost: 0.05 },
      { date: '2026-10-30', job: 'draftOne', agent: 'linkedin-service', client: 'asha-k3f9', inTokens: 100, outTokens: 50, cost: 0.04 },
    ],
    runs: [{ sk: '2026-11-05T03:30:00Z#c', job: 'publish', agent: 'linkedin-service', client: 'asha-k3f9', ok: false, ms: 1000 }],
    awsProjects: [
      { sk: '2026-11-04', projects: { 'linkedin-agent': 0.1, 'linkedin-service': 0.2, '': 2 } },
      { sk: '2026-10-31', projects: { 'linkedin-service': 5 } },
    ],
  },
  '2026-11-05',
);
assert.deepEqual(p.projects.map((x) => [x.project, x.aws.toFixed(2), x.llm.toFixed(2)]), [
  ['other (untagged)', '2.00', '0.00'],
  ['linkedin-service', '0.20', '0.05'],
  ['linkedin-agent', '0.10', '0.02'],
]);
assert.deepEqual(p.clients.map((c) => [c.client, c.tokens, c.cost.toFixed(2)]), [['asha-k3f9', 300, '0.09']]);
assert.deepEqual(p.jobs.map((j) => j.job).sort(), ['draft', 'linkedin-service / draftOne', 'linkedin-service / publish']);
const pd = dashboardHtml(p);
assert.ok(pd.includes('By project') && pd.includes('asha-k3f9') && pd.includes('linkedin-service / publish (asha-k3f9)'));
assert.equal(usd(0), '$0.00');

console.log('ok');
