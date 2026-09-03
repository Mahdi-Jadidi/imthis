const SAFE_STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2',
]);

function sanitizeSafeStaticHtml(value) {
  return String(value || '')
    .replace(/<script\b(?=[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\/)[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b(?=[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\/)[^>]*\/?\s*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*stylesheet)(?=[^>]*\bhref\s*=\s*["']\s*(?:https?:)?\/\/)[^>]*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe\b[^>]*\/?\s*>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<object\b[^>]*\/?\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, '')
    .replace(/<form\b[^>]*\/?\s*>/gi, '')
    .replace(/<\/form\s*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<script\b(?![^>]*\bsrc\s*=\s*["'][^"']+\.(?:js)(?:\?[^"']*)?["'])[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b(?![^>]*\bsrc\s*=\s*["'][^"']+\.(?:js)(?:\?[^"']*)?["'])[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src|action|formaction)\s*=\s*(?:"\s*(?:javascript:|vbscript:|data:text\/html)[^"]*"|'\s*(?:javascript:|vbscript:|data:text\/html)[^']*'|\s*(?:javascript:|vbscript:|data:text\/html)[^\s>]+)/gi, '');
}

function scanStaticFile(file) {
  const extension = file.extension;
  if (!SAFE_STATIC_EXTENSIONS.has(extension)) return 'unsupported file type';
  if (!['.html', '.htm', '.css', '.js'].includes(extension)) return null;

  const text = file.buffer.toString('utf8');
  if (text.includes('\u0000')) return 'binary content in a text file';

  let checks;
  if (extension === '.js') {
    checks = [
      [/\beval\s*\(/i, 'eval'],
      [/\bnew\s+Function\s*\(/i, 'dynamic code execution'],
      [/document\s*\.\s*cookie/i, 'cookie access'],
      [/\b(?:localStorage|sessionStorage)\s*\./i, 'browser storage access'],
      [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/i, 'network exfiltration'],
      [/(?:window\.)?location\s*(?:=|\.|\[)/i, 'forced navigation'],
      [/\bwindow\s*\.\s*open\s*\(/i, 'new-window navigation'],
    ];
  } else if (extension === '.html' || extension === '.htm') {
    checks = [
      [/<input\b[^>]*type\s*=\s*["']?password/i, 'password collection'],
      [/<form\b/i, 'forms are not allowed'],
      [/<iframe\b|<object\b|<embed\b/i, 'embedded content'],
      [/(?:javascript|vbscript)\s*:/i, 'executable URL'],
      [/\son[a-z0-9_-]+\s*=/i, 'inline event handler'],
      [/<script\b(?=[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\/)/i, 'external script'],
      [/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*stylesheet)(?=[^>]*\bhref\s*=\s*["']\s*(?:https?:)?\/\/)/i, 'external stylesheet'],
      [/(?:@import|url\s*\()\s*["']?\s*(?:https?:)?\/\//i, 'external style resource'],
    ];
  } else {
    checks = [
      [/@import\b/i, 'CSS import'],
      [/url\s*\(\s*["']?\s*(?:https?:)?\/\//i, 'external CSS resource'],
      [/expression\s*\(|javascript\s*:/i, 'executable CSS'],
    ];
  }

  const match = checks.find(([pattern]) => pattern.test(text));
  return match ? match[1] : null;
}

module.exports = {
  sanitizeSafeStaticHtml,
  scanStaticFile,
};
