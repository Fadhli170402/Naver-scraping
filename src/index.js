const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// STORAGE untuk fingerprint dan cookies dari browser asli
let latestBrowserFingerprint = null;
let browserCookies = [];

// Proxy configuration
const PROXY_HOST = 'network.mrproxy.com';
const PROXY_PORT = '10000';
const PROXY_USER = 'hiring-country-kr';
const PROXY_PASS = '12345678';
const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;

// Rate limiting configuration
let requestCount = 0;
let lastRequestTime = Date.now();
const MIN_DELAY = 5000;
const MAX_DELAY = 10000;
const MAX_RETRIES = 5;

// Enhanced User agents (lebih banyak variasi)
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
];

// Accept-Language pool (Korean focused)
const acceptLanguages = [
  'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'ko-KR,ko;q=0.9',
  'ko;q=0.9,en;q=0.8',
  'ko-KR,ko;q=0.8,en-US;q=0.7,en;q=0.6',
  'ko-KR,ko;q=0.9,en;q=0.8,ja;q=0.7'
];

// Sec-Ch-Ua variations (updated untuk Chrome 131)
const secChUaVariations = [
  '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  '"Chromium";v="131", "Not_A Brand";v="24"',
  '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="99"'
];

// Platform variations
const platforms = ['"Windows"', '"macOS"', '"Linux"'];

// Track used fingerprints
let usedFingerprints = [];
const MAX_FINGERPRINT_HISTORY = 5;

// Helper functions
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

async function throttleRequest() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_DELAY) {
    const delay = getRandomDelay();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  lastRequestTime = Date.now();
  requestCount++;
}

// Enhanced fingerprint generator dengan headers yang lebih lengkap
function generateFingerprint(excludeRecent = true) {
  let fingerprint;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    const userAgent = getRandomElement(userAgents);
    const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edg');
    const isEdge = userAgent.includes('Edg');
    const isFirefox = userAgent.includes('Firefox');
    const acceptLanguage = getRandomElement(acceptLanguages);
    
    // CRITICAL: Naver memerlukan headers yang sangat spesifik
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Referer': 'https://search.shopping.naver.com/',
      'Origin': 'https://search.shopping.naver.com',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Sec-GPC': '1',
      'Priority': 'u=1, i',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      // PENTING: Header Naver-specific
      'X-Search-Source': 'shopping',
      'X-Client-Version': '2.0.0',
    };
    
    // Add Chrome-specific headers
    if (isChrome || isEdge) {
      baseHeaders['Sec-Fetch-Dest'] = 'empty';
      baseHeaders['Sec-Fetch-Mode'] = 'cors';
      baseHeaders['Sec-Fetch-Site'] = 'same-origin';
      baseHeaders['Sec-Ch-Ua'] = getRandomElement(secChUaVariations);
      baseHeaders['Sec-Ch-Ua-Mobile'] = '?0';
      baseHeaders['Sec-Ch-Ua-Platform'] = getRandomElement(platforms);
    }
    
    // Create fingerprint signature for tracking
    const signature = `${userAgent}|${acceptLanguage}`;
    
    // Check if this fingerprint was recently used
    if (!excludeRecent || !usedFingerprints.includes(signature)) {
      fingerprint = {
        headers: baseHeaders,
        signature: signature
      };
      break;
    }
    
    attempts++;
  } while (attempts < maxAttempts);
  
  // Fallback if no unique fingerprint found
  if (!fingerprint) {
    const userAgent = getRandomElement(userAgents);
    const isChrome = userAgent.includes('Chrome');
    const acceptLanguage = getRandomElement(acceptLanguages);
    
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Referer': 'https://search.shopping.naver.com/',
      'Origin': 'https://search.shopping.naver.com',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Sec-GPC': '1',
      'Priority': 'u=1, i',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'X-Search-Source': 'shopping',
      'X-Client-Version': '2.0.0',
    };
    
    if (isChrome) {
      baseHeaders['Sec-Fetch-Dest'] = 'empty';
      baseHeaders['Sec-Fetch-Mode'] = 'cors';
      baseHeaders['Sec-Fetch-Site'] = 'same-origin';
      baseHeaders['Sec-Ch-Ua'] = getRandomElement(secChUaVariations);
      baseHeaders['Sec-Ch-Ua-Mobile'] = '?0';
      baseHeaders['Sec-Ch-Ua-Platform'] = getRandomElement(platforms);
    }
    
    fingerprint = {
      headers: baseHeaders,
      signature: `${userAgent}|${acceptLanguage}`
    };
  }
  
  // Track this fingerprint
  usedFingerprints.push(fingerprint.signature);
  if (usedFingerprints.length > MAX_FINGERPRINT_HISTORY) {
    usedFingerprints.shift();
  }
  
  return fingerprint;
}

// Helper function to convert cookies to Cookie header string
function cookiesToString(cookies) {
  if (!cookies || cookies.length === 0) return '';
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

// Enhanced scraping with better anti-detection
async function scrapeWithRetry(url, maxRetries = MAX_RETRIES) {
  let lastError;
  let fingerprint;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate new fingerprint for each attempt
      fingerprint = generateFingerprint(attempt > 1);
      
      console.log(`[Attempt ${attempt}/${maxRetries}] Scraping URL...`);
      console.log(`[Fingerprint] ${fingerprint.signature.substring(0, 80)}...`);
      
      // Configure proxy agent
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      
      // Build headers dengan priority order:
      // 1. Browser fingerprint (jika ada dari puppeteer)
      // 2. Generated fingerprint
      // 3. Cookies (jika ada)
      const headers = { ...fingerprint.headers };
      
      // Merge dengan browser fingerprint jika ada
      if (latestBrowserFingerprint) {
        Object.assign(headers, latestBrowserFingerprint);
        console.log('[Enhanced] Using real browser fingerprint');
      }
      
      // Add cookies jika ada
      if (browserCookies && browserCookies.length > 0) {
        headers['Cookie'] = cookiesToString(browserCookies);
        console.log('[Enhanced] Using browser cookies');
      }
      
      // PENTING: Parse URL untuk mendapatkan query params
      const urlObj = new URL(url);
      
      // Make request dengan config yang optimal
      const config = {
        method: 'GET',
        url: url,
        headers: headers,
        httpsAgent: proxyAgent,
        httpAgent: proxyAgent,
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
        // PENTING: Jangan decompress otomatis (biar natural)
        decompress: true,
        // PENTING: Follow redirects
        maxRedirects: 5,
      };
      
      console.log(`[Request] GET ${urlObj.pathname}${urlObj.search}`);
      
      const response = await axios(config);
      
      console.log(`[Response] Status: ${response.status}, Size: ${JSON.stringify(response.data).length} bytes`);
      
      // Check response status
      if (response.status === 200) {
        // Validate response data
        if (!response.data || typeof response.data !== 'object') {
          throw new Error('Invalid response format');
        }
        
        console.log(`[Attempt ${attempt}] ✓ SUCCESS`);
        
        return {
          success: true,
          data: response.data,
          statusCode: response.status,
          attempt: attempt,
          fingerprint: fingerprint.signature
        };
      } else if (response.status === 418) {
        // 418 = Bot detected!
        lastError = new Error(`Bot detected (418). Rotating fingerprint and retrying...`);
        console.log(`[Attempt ${attempt}] ✗ Bot detected (418) - Need better fingerprint`);
      } else {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        console.log(`[Attempt ${attempt}] ✗ Failed with status ${response.status}`);
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        const retryDelay = getRandomDelay() * attempt;
        console.log(`[Retry] Waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
    } catch (error) {
      lastError = error;
      console.log(`[Attempt ${attempt}] ✗ Error: ${error.message}`);
      
      // Wait before retry
      if (attempt < maxRetries) {
        const retryDelay = getRandomDelay() * attempt;
        console.log(`[Retry] Waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // All retries failed
  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts: maxRetries,
    lastFingerprint: fingerprint?.signature
  };
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    requestCount,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    features: {
      fingerprintRotation: true,
      automaticRetry: true,
      maxRetries: MAX_RETRIES,
      browserFingerprintActive: !!latestBrowserFingerprint,
      cookiesActive: browserCookies.length > 0
    }
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json({
    totalRequests: requestCount,
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    lastRequestTime: new Date(lastRequestTime).toISOString(),
    proxyStatus: 'active',
    fingerprintPool: {
      userAgents: userAgents.length,
      acceptLanguages: acceptLanguages.length,
      secChUaVariations: secChUaVariations.length,
      recentlyUsed: usedFingerprints.length
    },
    browserEnhancement: {
      fingerprintCaptured: !!latestBrowserFingerprint,
      cookiesCount: browserCookies.length,
      lastCaptured: latestBrowserFingerprint ? 'Active' : 'Not captured'
    },
    retryConfig: {
      maxRetries: MAX_RETRIES,
      exponentialBackoff: true,
      fingerprintRotationOnRetry: true
    }
  });
});

// MAIN SCRAPING ENDPOINT - Enhanced
app.get('/naver', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Missing or invalid URL parameter',
        example: '/naver?url=https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?...',
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL
    if (!url.includes('search.shopping.naver.com')) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid URL. Must be a Naver shopping URL',
        received: url,
        timestamp: new Date().toISOString()
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(`[${new Date().toISOString()}] Request #${requestCount + 1}`);
    console.log('='.repeat(80));

    // Implement request throttling
    await throttleRequest();

    // Scrape with retry
    const result = await scrapeWithRetry(url);

    const latency = Date.now() - startTime;

    if (result.success) {
      console.log(`\n✓ REQUEST SUCCESS (${latency}ms, Attempts: ${result.attempt}/${MAX_RETRIES})`);
      console.log('='.repeat(80) + '\n');

      // Return successful response
      res.json({
        success: true,
        latency: `${latency}ms`,
        statusCode: result.statusCode,
        data: result.data,
        metadata: {
          requestCount,
          timestamp: new Date().toISOString(),
          proxyUsed: true,
          fingerprintRotated: true,
          browserFingerprintUsed: !!latestBrowserFingerprint,
          cookiesUsed: browserCookies.length > 0,
          attemptsUsed: result.attempt,
          maxRetries: MAX_RETRIES,
          finalFingerprint: result.fingerprint.substring(0, 100) + '...'
        }
      });
    } else {
      console.error(`\n✗ REQUEST FAILED after ${result.attempts} attempts (${latency}ms)`);
      console.error(`Error: ${result.error}`);
      console.log('='.repeat(80) + '\n');
      
      // Return error with suggestion
      res.status(500).json({
        success: false,
        error: result.error,
        latency: `${latency}ms`,
        suggestion: result.error.includes('418') 
          ? 'Bot detected. Try running /naver/fingerprint to capture real browser fingerprint first.'
          : 'Request failed. Check proxy connection and try again.',
        metadata: {
          requestCount,
          timestamp: new Date().toISOString(),
          attemptsUsed: result.attempts,
          maxRetries: MAX_RETRIES,
          lastFingerprint: result.lastFingerprint?.substring(0, 100) + '...'
        }
      });
    }

  } catch (error) {
    const latency = Date.now() - startTime;
    
    console.error(`\n✗ UNEXPECTED ERROR: ${error.message}`);
    console.log('='.repeat(80) + '\n');
    
    res.status(500).json({
      success: false,
      error: 'Unexpected error: ' + error.message,
      latency: `${latency}ms`,
      metadata: {
        requestCount,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ENHANCED: Capture real browser fingerprint + cookies
app.get("/naver/fingerprint", async (req, res) => {
  let browser;
  try {
    console.log('\n🔍 Starting browser fingerprint capture...');
    
    browser = await puppeteer.launch({
      headless: false,
      channel: "chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--proxy-server=${PROXY_HOST}:${PROXY_PORT}`,
      ],
    });

    const page = await browser.newPage();
    
    // Authenticate proxy
    await page.authenticate({
      username: PROXY_USER,
      password: PROXY_PASS,
    });

    console.log('📡 Navigating to Naver Shopping...');
    
    // Navigate to Naver Shopping
    await page.goto('https://search.shopping.naver.com/ns/search?query=iphone ', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('⏳ Waiting for page to fully load...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Capture browser fingerprint
    const fingerprint = await page.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: navigator.languages,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory || null,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          colorDepth: window.screen.colorDepth
        },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        plugins: Array.from(navigator.plugins).map(p => p.name)
      };
    });

    // Capture cookies
    const cookies = await page.cookies();
    
    // Store for later use
    browserCookies = cookies;
    
    // Convert fingerprint to headers format
    latestBrowserFingerprint = {
      'User-Agent': fingerprint.userAgent,
      'Accept-Language': fingerprint.language,
      'Sec-Ch-Ua-Platform': `"${fingerprint.platform}"`,
    };

    console.log('✓ Fingerprint captured successfully!');
    console.log(`  - Cookies: ${cookies.length} items`);
    console.log(`  - User-Agent: ${fingerprint.userAgent.substring(0, 50)}...`);

    await browser.close();

    res.json({
      success: true,
      message: 'Browser fingerprint and cookies captured successfully!',
      fingerprint: fingerprint,
      cookiesCount: cookies.length,
      note: 'This fingerprint will be used for subsequent /naver requests'
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('✗ Error capturing fingerprint:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear captured fingerprint/cookies
app.get("/naver/clear", (req, res) => {
  latestBrowserFingerprint = null;
  browserCookies = [];
  usedFingerprints = [];
  
  res.json({
    success: true,
    message: 'Cleared all captured fingerprints and cookies'
  });
});

// Example endpoint
app.get('/', (req, res) => {
  const exampleUrl = 'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&searchMethod=all.basic';
  
  res.json({
    message: 'Naver Shopping Scraper API - Enhanced Anti-Detection',
    version: '3.0.0',
    endpoints: {
      health: '/health - Check API status',
      stats: '/stats - Get detailed statistics',
      scrape: '/naver?url=<URL> - Scrape Naver data',
      captureFingerprint: '/naver/fingerprint - Capture real browser fingerprint',
      clearFingerprint: '/naver/clear - Clear captured data'
    },
    usage: [
      '1. First run: GET /naver/fingerprint (capture real browser data)',
      '2. Then scrape: GET /naver?url=<NAVER_URL>',
      '3. API will use captured fingerprint for better success rate'
    ],
    example: `/naver?url=${encodeURIComponent(exampleUrl)}`,
    features: [
      'Real browser fingerprint capture via Puppeteer',
      'Cookie management from real browser session',
      'Enhanced headers with Naver-specific requirements',
      'Automatic retry with fingerprint rotation (max 5)',
      'Exponential backoff between retries',
      'IP rotation via proxy',
      'Request throttling (3-7s delay)',
      '418 Bot detection handling'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 Naver Scraper API v3.0 - Enhanced Anti-Detection');
  console.log('='.repeat(80));
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📊 Proxy: ${PROXY_HOST}:${PROXY_PORT} (Korea)`);
  console.log(`⏱️  Throttling: ${MIN_DELAY}-${MAX_DELAY}ms`);
  console.log(`🔁 Max Retries: ${MAX_RETRIES}`);
  console.log(`🎭 Fingerprint Pool: ${userAgents.length} User-Agents`);
  console.log('='.repeat(80));
  console.log('\n✨ Enhanced Features:');
  console.log('   → Real browser fingerprint capture with Puppeteer');
  console.log('   → Cookie management from browser session');
  console.log('   → Naver-specific header optimization');
  console.log('   → 418 Bot detection handling');
  console.log('   → Automatic retry with exponential backoff');
  console.log('\n📖 Quick Start:');
  console.log('   1. GET /naver/fingerprint  (capture browser data)');
  console.log('   2. GET /naver?url=...      (start scraping)');
  console.log('\n🎯 Ready to scrape Naver Shopping!\n');
});

module.exports = app;