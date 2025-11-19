const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// STORAGE untuk fingerprint terbaru
let latestBrowserFingerprint = null;

// Proxy configuration
const PROXY_HOST = 'network.mrproxy.com';
const PROXY_PORT = '10000';
const PROXY_USER = 'hiring-country-kr';
const PROXY_PASS = '12345678';
const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;

// Rate limiting configuration
let requestCount = 0;
let lastRequestTime = Date.now();
const MIN_DELAY = 3000;
const MAX_DELAY = 7000;
const MAX_RETRIES = 5; // Maximum retry attempts

// User agents pool for rotation
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
];

// Accept-Language pool for rotation
const acceptLanguages = [
  'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'ko-KR,ko;q=0.9',
  'ko;q=0.9,en;q=0.8',
  'ko-KR,ko;q=0.8,en-US;q=0.7,en;q=0.6',
  'ko-KR,ko;q=0.9,en;q=0.8'
];

// Sec-Ch-Ua variations
const secChUaVariations = [
  '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  '"Not_A Brand";v="8", "Chromium";v="120"',
  '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"',
  '"Microsoft Edge";v="121", "Chromium";v="121", "Not-A.Brand";v="99"'
];

// Platform variations
const platforms = ['"Windows"', '"macOS"', '"Linux"'];

// Track used fingerprints to avoid immediate reuse
let usedFingerprints = [];
const MAX_FINGERPRINT_HISTORY = 5;

// Function to get random element from array
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Function to generate random delay
function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

// Function to implement request throttling
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

// Enhanced function to generate fingerprint with uniqueness tracking
function generateFingerprint(excludeRecent = true) {
  let fingerprint;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    const userAgent = getRandomElement(userAgents);
    const isChrome = userAgent.includes('Chrome');
    const isFirefox = userAgent.includes('Firefox');
    const acceptLanguage = getRandomElement(acceptLanguages);
    
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://search.shopping.naver.com/',
      'Origin': 'https://search.shopping.naver.com',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    // Add Chrome-specific headers
    if (isChrome) {
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
  
  // If we couldn't find unused fingerprint, use any
  if (!fingerprint) {
    const userAgent = getRandomElement(userAgents);
    const isChrome = userAgent.includes('Chrome');
    const acceptLanguage = getRandomElement(acceptLanguages);
    
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://search.shopping.naver.com/',
      'Origin': 'https://search.shopping.naver.com',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
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
    usedFingerprints.shift(); // Remove oldest
  }
  
  return fingerprint;
}

// Enhanced scraping function with retry and fingerprint rotation
async function scrapeWithRetry(url, maxRetries = MAX_RETRIES) {
  let lastError;
  let fingerprint;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate new fingerprint for each attempt
      fingerprint = generateFingerprint(attempt > 1); // Exclude recent after first attempt
      
      console.log(`[Attempt ${attempt}/${maxRetries}] Using fingerprint: ${fingerprint.signature.substring(0, 50)}...`);
      
      // Configure proxy agent
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      
      // Make request with current fingerprint
      const config = {
        method: 'GET',
        url: url,
        headers: fingerprint.headers,
        httpsAgent: proxyAgent,
        httpAgent: proxyAgent,
        timeout: 30000,
        validateStatus: (status) => status < 500,
        maxRedirects: 5
      };
      if (latestBrowserFingerprint) {
            config.headers = {
            ...config.headers,
            ...latestBrowserFingerprint
            };
        console.log("Menggunakan fingerprint browser asli dari puppeteer.");
        }
      const response = await axios(config);
      
      // Check if response is successful
      if (response.status === 200) {
        console.log(`[Attempt ${attempt}] ✓ Success with fingerprint rotation`);
        return {
          success: true,
          data: response.data,
          statusCode: response.status,
          attempt: attempt,
          fingerprint: fingerprint.signature
        };
      }
      
      // If status is not 200, treat as error and retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      console.log(`[Attempt ${attempt}] ✗ Failed with status ${response.status}, rotating fingerprint...`);
      
      // Wait before retry with increasing delay
      if (attempt < maxRetries) {
        const retryDelay = getRandomDelay() * attempt; // Exponential backoff
        console.log(`[Retry] Waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
    } catch (error) {
      lastError = error;
      console.log(`[Attempt ${attempt}] ✗ Error: ${error.message}, rotating fingerprint...`);
      
      // Wait before retry with increasing delay
      if (attempt < maxRetries) {
        const retryDelay = getRandomDelay() * attempt; // Exponential backoff
        console.log(`[Retry] Waiting ${retryDelay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // All retries failed
  return {
    success: false,
    error: lastError.message,
    attempts: maxRetries,
    lastFingerprint: fingerprint?.signature
  };
}

// Middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    requestCount,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    features: {
      fingerprintRotation: true,
      automaticRetry: true,
      maxRetries: MAX_RETRIES
    }
  });
});

// Statistics endpoint
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
    retryConfig: {
      maxRetries: MAX_RETRIES,
      exponentialBackoff: true,
      fingerprintRotationOnRetry: true
    },
    features: {
      fingerprintRotation: true,
      ipRotation: true,
      requestThrottling: true,
      randomDelays: true,
      automaticRetry: true
    }
  });
});

// Main scraping endpoint with automatic retry and fingerprint rotation
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
    if (!url.includes('search.shopping.naver.com/ns/v1/search/paged-composite-cards')) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid URL. Must be a Naver paged-composite-cards API URL',
        received: url,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[${new Date().toISOString()}] Request #${requestCount + 1}: Starting with auto-retry...`);

    // Implement request throttling
    await throttleRequest();

    // Scrape with automatic retry and fingerprint rotation
    const result = await scrapeWithRetry(url);

    const latency = Date.now() - startTime;

    if (result.success) {
      console.log(`[${new Date().toISOString()}] Request #${requestCount}: SUCCESS (${latency}ms, Attempt: ${result.attempt}/${MAX_RETRIES})`);

      // Return the scraped data
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
          attemptsUsed: result.attempt,
          maxRetries: MAX_RETRIES,
          finalFingerprint: result.fingerprint.substring(0, 100) + '...'
        }
      });
    } else {
      console.error(`[${new Date().toISOString()}] Request #${requestCount}: FAILED after ${result.attempts} attempts (${latency}ms)`);
      
      res.status(500).json({
        success: false,
        error: result.error,
        latency: `${latency}ms`,
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
    
    console.error(`[${new Date().toISOString()}] Request #${requestCount}: UNEXPECTED ERROR - ${error.message}`);
    
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

// Example endpoint
app.get('/', (req, res) => {
  const exampleUrl = 'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=nike&searchMethod=all.basic';
  
  res.json({
    message: 'Naver Shopping Scraper API with Auto-Retry & Fingerprint Rotation',
    version: '2.0.0',
    endpoints: {
      health: {
        url: '/health',
        description: 'Check API health status'
      },
      stats: {
        url: '/stats',
        description: 'Get detailed API statistics'
      },
      scrape: {
        url: '/naver?url=<NAVER_API_URL>',
        description: 'Scrape Naver shopping data with automatic retry'
      }
    },
    example: `/naver?url=${encodeURIComponent(exampleUrl)}`,
    features: [
      'Automatic fingerprint rotation on each request',
      'Retry on failure with NEW fingerprint (max 3 attempts)',
      'Exponential backoff between retries',
      'IP rotation via proxy',
      'Request throttling (1-3s delay)',
      'Fingerprint history tracking to avoid reuse',
      'Comprehensive error handling'
    ],
    retryStrategy: {
      maxRetries: MAX_RETRIES,
      behavior: 'On error/non-200 status, automatically retry with new fingerprint',
      backoff: 'Exponential (delay × attempt number)',
      fingerprintRotation: 'New fingerprint generated for each retry attempt',
      fingerprintTracking: 'Last 5 fingerprints tracked to avoid immediate reuse'
    }
  });
});

// app.get("/naver/fingerprint", async (req, res) => {
//   try {
//     const target = "https://search.shopping.naver.com/";

//     const browser = await puppeteer.launch({
//       headless: false,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-blink-features=AutomationControlled"
//       ]
//     });

//     const page = await browser.newPage();

//     await page.setRequestInterception(true);

//     page.on("request", (interceptedReq) => {
//       interceptedReq.continue();
//     });

//     const collectedHeaders = {};

//     page.on("requestfinished", async (finishedReq) => {
//       const url = finishedReq.url();

//       // Target Naver API
//       if (url.includes("paged-composite-cards")) {
//         const headers = finishedReq.headers();
//         collectedHeaders[url] = headers;
//         latestBrowserFingerprint = headers; // save for later use
//       }
//     });

//     console.log("Opening Naver page...");
//     await page.goto(target, { waitUntil: "networkidle2", timeout: 60000 });

//     // Tunggu request API keluar (Naver suka lazy-loading)
//     await new Promise(resolve => setTimeout(resolve, 60000));

//     await browser.close();

//     if (!latestBrowserFingerprint) {
//       return res.status(404).json({
//         success: false,
//         message: "Tidak menemukan API header. Scroll halaman dulu di browser."
//       });
//     }

//     res.json({
//       success: true,
//       message: "Fingerprint berhasil ditangkap!",
//       fingerprint: latestBrowserFingerprint
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       error: err.message
//     });
//   }
// });

// app.get("/naver/start", async (req, res) => {
//     try {
//         naverSession.browser = await puppeteer.launch({
//             headless: false,
//             channel: "chrome",
//             args: ["--no-sandbox"],
//         });

//         naverSession.page = await naverSession.browser.newPage();

//         // Buka halaman utama Naver Shopping (akan trigger cookies, tokens, atau CAPTCHA)
//         await naverSession.page.goto("https://search.shopping.naver.com", {
//             waitUntil: "networkidle2",
//         });

//         res.json({
//             success: true,
//             message:
//                 "Browser launched. Solve CAPTCHA or login if needed. When finished, call /naver/collect",
//         });
//     } catch (error) {
//         res.json({ success: false, error: error.message });
//     }
// });

// app.get("/naver/collect", async (req, res) => {
//     try {
//         const page = naverSession.page;
//         if (!page) {
//             return res.json({
//                 success: false,
//                 error: "No active session. Run /naver/start first.",
//             });
//         }

//         // Ambil cookies
//         const cookies = await page.cookies();

//         // Ambil localStorage
//         const localStorageData = await page.evaluate(() => {
//             let data = {};
//             for (let i = 0; i < localStorage.length; i++) {
//                 const key = localStorage.key(i);
//                 data[key] = localStorage.getItem(key);
//             }
//             return data;
//         });

//         // Ambil sessionStorage
//         const sessionStorageData = await page.evaluate(() => {
//             let data = {};
//             for (let i = 0; i < sessionStorage.length; i++) {
//                 const key = sessionStorage.key(i);
//                 data[key] = sessionStorage.getItem(key);
//             }
//             return data;
//         });

//         // Ambil response tokens (x-naver-client*, dll)
//         const performanceEntries = await page.evaluate(() => {
//             const entries = performance.getEntries() || [];
//             const apiCalls = entries.filter((e) =>
//                 e.name.includes("search/paged-composite-cards")
//             );
//             return apiCalls.map((e) => e.name);
//         });

//         // Ambil Request Headers untuk API internal Naver
//         let capturedHeaders = {};
//         page.on("request", (req) => {
//             if (req.url().includes("paged-composite-cards")) {
//                 capturedHeaders = req.headers();
//             }
//         });

//         await new Promise((resolve) => setTimeout(resolve, 1500));

//         // Ambil fingerprint
//         const fingerprint = await page.evaluate(() => {
//             return {
//                 userAgent: navigator.userAgent,
//                 platform: navigator.platform,
//                 language: navigator.language,
//                 languages: navigator.languages,
//                 hardwareConcurrency: navigator.hardwareConcurrency,
//                 deviceMemory: navigator.deviceMemory || null,
//                 screen: {
//                     width: window.screen.width,
//                     height: window.screen.height,
//                     colorDepth: window.screen.colorDepth,
//                 },
//                 timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
//                 plugins: Array.from(navigator.plugins).map((p) => p.name),
//             };
//         });

//         // Tutup browser setelah selesai
//         await naverSession.browser.close();

//         // Reset session
//         naverSession.browser = null;
//         naverSession.page = null;

//         res.json({
//             success: true,
//             cookies,
//             localStorage: localStorageData,
//             sessionStorage: sessionStorageData,
//             capturedHeaders,
//             apiEndpointsDetected: performanceEntries,
//             fingerprint,
//         });
//     } catch (error) {
//         res.json({
//             success: false,
//             error: error.message,
//         });
//     }
// });


app.get("/naver/fingerprint", async (req, res) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            channel: "chrome",
            args: ["--no-sandbox"],
        });

        const page = await browser.newPage();

        // Tunggu 2 detik → Ganti waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 2000));

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

        res.json({
            success: true,
            fingerprint
        });

        await browser.close();
    } catch (error) {
        if (browser) await browser.close();
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
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
  console.log('='.repeat(70));
  console.log('🚀 Naver Scraper API v2.0 - Enhanced with Auto-Retry');
  console.log('='.repeat(70));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📊 Proxy: ${PROXY_HOST}:${PROXY_PORT} (Korea)`);
  console.log(`⏱️  Request throttling: ${MIN_DELAY}-${MAX_DELAY}ms`);
  console.log(`🔄 User-Agent pool: ${userAgents.length} variations`);
  console.log(`🌐 Accept-Language pool: ${acceptLanguages.length} variations`);
  console.log(`🔁 Max retry attempts: ${MAX_RETRIES} with fingerprint rotation`);
  console.log(`📝 Fingerprint history: Last ${MAX_FINGERPRINT_HISTORY} tracked`);
  console.log('='.repeat(70));
  console.log('\n✨ New Features:');
  console.log('   → Automatic retry on error with NEW fingerprint');
  console.log('   → Exponential backoff between retries');
  console.log('   → Fingerprint uniqueness tracking');
  console.log('   → Enhanced logging for debugging');
  console.log('\n📖 Endpoints:');
  console.log(`   - GET /health      → Health check`);
  console.log(`   - GET /stats       → Detailed statistics`);
  console.log(`   - GET /naver?url=  → Scrape with auto-retry`);
  console.log(`   - GET /            → Documentation`);
  console.log('\n🎯 Ready to accept requests with intelligent retry!\n');
});

module.exports = app;