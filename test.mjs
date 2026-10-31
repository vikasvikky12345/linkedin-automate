import assert from 'node:assert/strict';
import { littleText, nextApproved, validatePosts } from './src/lib.js';

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
console.log('ok');
