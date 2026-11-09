import assert from 'node:assert/strict';
import { littleText, nextApproved, validatePosts, validatePost, parseFeed, isPeak, llmCost, summarize, dashboardHtml, usd, validateReport, marketHtml, ideasHtml, pickTopics, withSource, kindsFor, titleOf, layout, videoTimeline, videoHtml, slidesHtml, cardHtml } from './src/lib.js';

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

const topicsMd = '# AWS topics\nIntro line\n1. IAM roles | https://d/iam.html\n2. S3 buckets\n3. Lambda | https://d/l.html\n4. DynamoDB\n';
const t = (name, url = null) => ({ name, url });
assert.deepEqual(pickTopics(topicsMd), { topics: [t('IAM roles', 'https://d/iam.html'), t('S3 buckets'), t('Lambda', 'https://d/l.html')], next: 3 });
assert.deepEqual(pickTopics(topicsMd, 3), { topics: [t('DynamoDB'), t('IAM roles', 'https://d/iam.html'), t('S3 buckets')], next: 2 }); // wraps
assert.throws(() => pickTopics('1. only one'), /at least 3/);

// Source line goes above the hashtags, once
assert.equal(withSource('Hi\n\nQ? 👇\n\n#AWS #IAM', 'https://d/x'), 'Hi\n\nQ? 👇\n\n📖 Source: https://d/x\n\n#AWS #IAM');
assert.equal(withSource('Hi', 'https://d/x'), 'Hi\n📖 Source: https://d/x\n');
assert.equal(withSource('Hi https://d/x', 'https://d/x'), 'Hi https://d/x');
assert.equal(withSource('Hi', null), 'Hi');

// Slots: carousel, video, then cheat sheet / puzzle on alternate days
assert.deepEqual(kindsFor('2026-11-09').slice(0, 2), ['carousel', 'video']);
assert.notEqual(kindsFor('2026-11-09')[2], kindsFor('2026-11-10')[2]);
assert.notEqual(kindsFor('2026-10-31')[2], kindsFor('2026-11-01')[2]); // across a 31-day month too

// Video posts
const diagram = { nodes: [{ id: 'u', label: 'You', service: 'User' }, { id: 'l', label: 'Function', service: 'Lambda' }, { id: 's', label: 'Bucket', service: 'S3' }], edges: [{ from: 'u', to: 'l', label: 'invoke' }, { from: 'l', to: 's' }, { from: 's', to: 'ghost' }] };
const vid = { kind: 'video', text: 'x', video: { title: 'Flow', diagram, steps: [{ from: 'u', to: 'l', caption: 'a' }, { from: 'l', to: 's', caption: '<b>' }] } };
assert.ok(validatePost(vid));
assert.equal(titleOf(vid), 'Flow');
assert.throws(() => validatePost({ ...vid, video: { ...vid.video, steps: [{ from: 'u', to: 'nope', caption: 'a' }, { from: 'u', to: 'l', caption: 'b' }] } }), /steps/);
assert.throws(() => validatePost({ kind: 'video', text: 'x' }), /Video/);
const lay = layout(diagram, 900, 600);
assert.equal(lay.edges.length, 2); // edge to an unknown node is dropped
const y = Object.fromEntries(lay.nodes.map((n) => [n.id, n.y]));
assert.ok(y.u < y.l && y.l < y.s); // flows top to bottom
assert.ok(lay.edges[0].y1 > y.u && lay.edges[0].y2 < y.l); // arrows start and end at the box edges
assert.equal(layout({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }, 900, 600).nodes.length, 2); // a cycle still lays out
const chain = { nodes: 'abcdef'.split('').map((id) => ({ id, label: id })), edges: 'abcde'.split('').map((c, i) => ({ from: c, to: 'abcdef'[i + 1] })) };
const wrapped = layout(chain, 900, 600);
assert.equal(new Set(wrapped.nodes.map((n) => n.x)).size, 2); // 6 in a row wrap into 2 columns
assert.ok(wrapped.h >= 100);
assert.deepEqual([videoTimeline(2).total, videoTimeline(6).total, videoTimeline(9).total], [20, 26, 30]);
const vp = videoHtml(vid.video);
assert.ok(vp.includes('window.frame') && vp.includes('Lambda') && !vp.includes('"<b>"'));

// Carousel / card blocks: diagram, before/after, table
const deck = slidesHtml([{ title: 'Cover', diagram }, { title: 'Fix', before: 'old', after: 'new' }, { title: 'Cheat sheet', table: { rows: [['Role', '<temp creds>']] } }]);
assert.ok(deck.includes('class="diagram"') && deck.includes('Before') && deck.includes('&lt;temp creds&gt;') && deck.includes('3 / 3'));
assert.ok(cardHtml({ title: 'S3 cheat sheet', table: { columns: ['Class', 'Use'], rows: [['Standard', 'hot data']] } }).includes('<th>Class</th>'));

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
