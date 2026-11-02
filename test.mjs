import assert from 'node:assert/strict';
import { littleText, nextApproved, validatePosts, parseFeed, validateReport, marketHtml, ideasHtml } from './src/lib.js';

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
console.log('ok');
