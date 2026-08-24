#!/usr/bin/env node
import { youtubeVideoId, youtubeEmbedUrl, youtubeDropdownHtml } from '../js/utils.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(youtubeVideoId('https://youtu.be/vqQ9ok0dEgk') === 'vqQ9ok0dEgk', 'youtu.be');
assert(youtubeVideoId('https://www.youtube.com/watch?v=p2t9daxLpB8') === 'p2t9daxLpB8', 'watch');
assert(youtubeVideoId('https://youtube.com/watch?v=p2t9daxLpB8&t=12') === 'p2t9daxLpB8', 'watch with t');
assert(youtubeVideoId('https://youtu.be/-XVRl8KU7x0') === '-XVRl8KU7x0', 'id starting with dash');
assert(youtubeVideoId('https://www.youtube.com/embed/BmYuAG2j2co') === 'BmYuAG2j2co', 'embed');
assert(youtubeVideoId('https://www.youtube.com/shorts/vqQ9ok0dEgk') === 'vqQ9ok0dEgk', 'shorts');
assert(youtubeVideoId('https://m.youtube.com/watch?v=p2t9daxLpB8') === 'p2t9daxLpB8', 'mobile');
assert(youtubeVideoId('') === null, 'empty');
assert(youtubeVideoId('https://example.com/watch?v=p2t9daxLpB8') === null, 'other host');
assert(youtubeVideoId('not a url') === null, 'invalid');

const embed = youtubeEmbedUrl('-XVRl8KU7x0');
assert(embed.includes('youtube-nocookie.com/embed/-XVRl8KU7x0'), 'embed url');
assert(embed.includes('rel=0'), 'rel=0');
assert(youtubeEmbedUrl('bad') === null, 'bad id');

const html = youtubeDropdownHtml('https://youtu.be/vqQ9ok0dEgk', 'hoje:demo');
assert(html.includes('details class="ex-youtube"'), 'details');
assert(html.includes('data-yt-id="vqQ9ok0dEgk"'), 'yt id attr');
assert(html.includes('<summary>'), 'summary');
assert(!html.includes('<iframe'), 'lazy: no iframe until open');

const fallback = youtubeDropdownHtml('https://example.com/x', 'hoje:x');
assert(fallback.includes('href="https://example.com/x"'), 'fallback link');
assert(youtubeDropdownHtml('', 'k') === '', 'empty url');

const { BBTS_BEGINNER } = await import('../js/data/bbts-beginner.js');
const days = ['upper', 'lower', 'pull', 'push', 'legs'];
let urls = 0;
for (let w = 1; w <= 12; w++) {
  const week = BBTS_BEGINNER.weeks[String(w)];
  for (const d of days) {
    for (const ex of week[d].exercises) {
      const all = [ex, ...(ex.substitutes || [])];
      for (const item of all) {
        if (!item.youtubeUrl) continue;
        urls++;
        assert(youtubeVideoId(item.youtubeUrl), 'unparsed ' + item.youtubeUrl);
      }
    }
  }
}
assert(urls > 100, 'expected many youtube urls');

console.log('OK youtube helpers', urls, 'program urls');
