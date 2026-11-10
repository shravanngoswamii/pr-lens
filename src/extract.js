import { validate } from './document.js';
import { emptyFeedback, validateFeedback } from './feedback.js';

export function extract(html) {
  const read = id => {
    const pattern = new RegExp(`<script\\b(?=[^>]*\\bid=["']${id}["'])(?=[^>]*\\btype=["']application/json["'])[^>]*>([\\s\\S]*?)<\\/script>`, 'gi');
    const matches = [...html.matchAll(pattern)];
    if (matches.length > 1) throw new Error(`More than one embedded ${id} record`);
    return matches.length ? JSON.parse(matches[0][1]) : undefined;
  };
  const doc = read('review-data');
  if (!doc) throw new Error('No embedded review JSON found');
  validate(doc);
  const feedback = validateFeedback(read('feedback-data') ?? emptyFeedback(doc), doc);
  return { doc, feedback };
}
