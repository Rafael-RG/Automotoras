import { safeExternalUrl } from './safeExternalUrl';

test.each([
  ['https://example.invalid/path?source=redautos', 'https://example.invalid/path?source=redautos'],
  [' javascript:alert(1)', ''],
  ['data:text/html,unsafe', ''],
  ['http://example.invalid', ''],
  ['https://user:pass@example.invalid', ''],
  ['not a URL', ''],
])('safeExternalUrl only returns safe HTTPS destinations', (input, expected) => {
  expect(safeExternalUrl(input)).toBe(expected);
});
