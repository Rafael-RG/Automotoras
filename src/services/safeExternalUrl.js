// Defense in depth for public data that may have been stored before server-side
// validation existed. The server is authoritative; this keeps legacy rows from
// becoming executable navigation targets in the browser.
const hasControlCharacter = (value) => [...value].some((character) => {
  const code = character.charCodeAt(0);
  return code <= 31 || code === 127;
});

export const safeExternalUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || hasControlCharacter(value)) {
    return '';
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.href
      : '';
  } catch {
    return '';
  }
};
