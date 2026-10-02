import { describeError, redactPaths } from './redact';

describe('redactPaths', () => {
  it.each([
    [
      "ENOENT: no such file, open '/Users/fyu/Pictures/beach.jpg'",
      "ENOENT: no such file, open '<path>'",
    ],
    ['failed /Volumes/Photo/2013/0095.jpg: bad', 'failed <path> bad'],
    ['see file:///Users/fyu/a.png now', 'see <path> now'],
    ['at ~/Pictures/x.heic', 'at <path>'],
    ["open 'C:\\Users\\John Doe\\Pictures\\a.jpg'", "open '<path>'"],
    ["open '/Users/me/My Photos/a.jpg'", "open '<path>'"],
    ['failed D:\\Photo\\2013\\0095.jpg bad', 'failed <path> bad'],
    ['failed D:/Photo/x.jpg', 'failed <path>'],
    ['share \\\\nas\\photos\\x.jpg', 'share <path>'],
  ])('redacts %s', (input, expected) => {
    expect(redactPaths(input)).toBe(expected);
  });

  it('redacts the drive-rooted part of unquoted stack frames', () => {
    const frame =
      'at C:\\Program Files\\Photo Organizer\\resources\\app.asar\\index.js:1:2';
    expect(redactPaths(frame)).not.toContain('C:\\');
  });

  it('keeps times, ratios and URLs that are not paths', () => {
    expect(redactPaths('at 12:30 ratio 1:2 code E:1')).toBe(
      'at 12:30 ratio 1:2 code E:1'
    );
  });

  it('keeps text without paths', () => {
    expect(redactPaths('Input buffer contains unsupported image format')).toBe(
      'Input buffer contains unsupported image format'
    );
  });

  it('describes errors without leaking paths', () => {
    const error = new Error("open '/Users/me/secret.jpg'");
    expect(describeError(error)).not.toContain('/Users/me');
    expect(describeError('plain /Volumes/Photo/x.jpg')).toBe('plain <path>');
  });
});
