import dns from 'dns/promises';
import { URL } from 'url';
import * as cheerio from 'cheerio';

export interface ScrapedWebContent {
  title: string;
  sourceUrl: string;
  finalUrl: string;
  publishedDate?: string;
  description?: string;
  extractedText: string;
  charCount: number;
  wordCount: number;
  metadata: Record<string, any>;
}

// Private & Cloud Metadata IPv4 CIDR checks
function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local & AWS/GCP Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// Private IPv6 checks
function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd00:')) {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid URL format: "${rawUrl}". Must be a valid HTTP or HTTPS address.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden protocol "${parsed.protocol}". Only http: and https: are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`Access to local or internal domain "${hostname}" is forbidden.`);
  }

  // Resolve hostname to IP to verify against SSRF with a 5s DNS timeout
  try {
    const lookupPromise = dns.lookup(hostname, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error('DNS lookup timed out after 5000ms')), 5000);
      if (typeof t.unref === 'function') t.unref();
    });
    const addresses = await Promise.race([lookupPromise, timeoutPromise]);
    if (!addresses || addresses.length === 0) {
      throw new Error(`Could not resolve hostname "${hostname}".`);
    }

    for (const addr of addresses) {
      if (addr.family === 4 && isPrivateOrReservedIPv4(addr.address)) {
        throw new Error(`URL resolves to a private or reserved IPv4 address (${addr.address}). Access is forbidden.`);
      }
      if (addr.family === 6 && isPrivateOrReservedIPv6(addr.address)) {
        throw new Error(`URL resolves to a private or reserved IPv6 address (${addr.address}). Access is forbidden.`);
      }
    }
  } catch (err: any) {
    if (err.message?.includes('forbidden') || err.message?.includes('resolves to a private')) {
      throw err;
    }
    throw new Error(`DNS resolution failed for "${hostname}": ${err.message || 'Host unreachable.'}`);
  }

  return parsed;
}

export async function fetchWebDocument(
  targetUrl: string,
  options: {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<{ html: string; finalUrl: string }> {
  const maxBytes = options.maxBytes || 5 * 1024 * 1024; // 5 MB max
  const timeoutMs = options.timeoutMs || 15000; // 15s timeout
  const maxRedirects = options.maxRedirects ?? 5;

  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const validated = await validateSafeUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(validated.toString(), {
        signal: controller.signal,
        redirect: 'manual', // Manually validate each redirect destination against SSRF
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; SahayakGovBot/1.0; +https://sahayak.gov.in)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Connection to "${currentUrl}" timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw new Error(`Failed to connect to "${currentUrl}": ${err.message || err}`);
    } finally {
      clearTimeout(timer);
    }

    // Handle Redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect response (${response.status}) missing Location header from "${currentUrl}".`);
      }
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (exceeded limit of ${maxRedirects}).`);
      }
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Website returned HTTP ${response.status} (${response.statusText}) for "${currentUrl}".`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml') && !contentType.includes('xml')) {
      throw new Error(`Unsupported content type "${contentType}". Only HTML or text web pages are supported.`);
    }

    // Stream reader with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      const fullText = await response.text();
      if (fullText.length > maxBytes) {
        throw new Error(`Website content exceeded maximum limit of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      }
      return { html: fullText, finalUrl: currentUrl };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.length;
          if (receivedBytes > maxBytes) {
            throw new Error(`Website content exceeded maximum limit of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const decoder = new TextDecoder('utf-8');
    const totalBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const html = decoder.decode(totalBuffer);
    return { html, finalUrl: currentUrl };
  }

  throw new Error(`Exceeded maximum redirect limit.`);
}

export function extractStructuredWebContent(html: string, sourceUrl: string, finalUrl: string): ScrapedWebContent {
  const $ = cheerio.load(html);

  // Remove non-content elements and chrome
  $(
    [
      'script',
      'style',
      'noscript',
      'iframe',
      'svg',
      'canvas',
      'header',
      'footer',
      'nav',
      'aside',
      '.navbar',
      '.nav',
      '.menu',
      '.footer',
      '.sidebar',
      '.cookie-banner',
      '#cookie-notice',
      '.advertisement',
      '.ad-container',
      '.social-share',
      '[role="banner"]',
      '[role="navigation"]',
      '[role="complementary"]',
      'form',
    ].join(',')
  ).remove();

  // Extract Metadata
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    'Official Portal Publication';

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    undefined;

  const publishedDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="publish-date"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    undefined;

  // Prefer main content container if present
  let $contentRoot: any = $('main');
  if ($contentRoot.length === 0) $contentRoot = $('article');
  if ($contentRoot.length === 0) $contentRoot = $('#content, .content, #main, .main, .container');
  if ($contentRoot.length === 0) $contentRoot = $('body');

  const textBlocks: string[] = [];

  // Extract headings, paragraphs, lists, and tables in document order
  $contentRoot.find('h1, h2, h3, h4, h5, h6, p, ul, ol, table').each((_i: number, el: any) => {
    const tagName = el.tagName.toLowerCase();

    if (tagName.startsWith('h')) {
      const headingText = $(el).text().replace(/\s+/g, ' ').trim();
      if (headingText) {
        const level = Number.parseInt(tagName[1], 10) || 2;
        const prefix = '#'.repeat(level);
        textBlocks.push(`\n${prefix} ${headingText}\n`);
      }
    } else if (tagName === 'p') {
      const pText = $(el).text().replace(/\s+/g, ' ').trim();
      if (pText.length > 20) {
        textBlocks.push(pText);
      }
    } else if (tagName === 'ul' || tagName === 'ol') {
      const items: string[] = [];
      $(el)
        .find('li')
        .each((_j: number, li: any) => {
          const liText = $(li).text().replace(/\s+/g, ' ').trim();
          if (liText) items.push(`• ${liText}`);
        });
      if (items.length > 0) {
        textBlocks.push(items.join('\n'));
      }
    } else if (tagName === 'table') {
      const rows: string[] = [];
      $(el)
        .find('tr')
        .each((_r: number, tr: any) => {
          const cells: string[] = [];
          $(tr)
            .find('th, td')
            .each((_c: number, cell: any) => {
              const cText = $(cell).text().replace(/\s+/g, ' ').trim();
              if (cText) cells.push(cText);
            });
          if (cells.length > 0) {
            rows.push(cells.join(' | '));
          }
        });
      if (rows.length > 0) {
        textBlocks.push('\n[Table Data]\n' + rows.join('\n'));
      }
    }
  });

  let extractedText = textBlocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  // Fallback to body text if structured elements were sparse
  if (extractedText.length < 150) {
    const rawBody = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (rawBody.length > extractedText.length) {
      extractedText = rawBody;
    }
  }

  const cleanTitle = title.replace(/\s+/g, ' ').slice(0, 200).trim();
  const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;

  return {
    title: cleanTitle,
    sourceUrl,
    finalUrl,
    publishedDate,
    description,
    extractedText,
    charCount: extractedText.length,
    wordCount,
    metadata: {
      extractedVia: 'sahayak-semantic-scraper-v2',
      scrapedAt: new Date().toISOString(),
      publishedDate,
      description,
      finalUrl,
    },
  };
}
