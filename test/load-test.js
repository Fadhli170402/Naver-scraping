const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:3000';
const TEST_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const TARGET_REQUESTS = 1000;

// Test URLs
const testUrls = [
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=nike&searchMethod=all.basic',
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&searchMethod=all.basic',
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=laptop&searchMethod=all.basic',
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=samsung&searchMethod=all.basic',
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=adidas&searchMethod=all.basic'
];

// Statistics
let stats = {
  total: 0,
  success: 0,
  failed: 0,
  totalLatency: 0,
  minLatency: Infinity,
  maxLatency: 0,
  errors: []
};

function getRandomUrl() {
  return testUrls[Math.floor(Math.random() * testUrls.length)];
}

async function makeRequest() {
  const url = getRandomUrl();
  const startTime = Date.now();
  
  try {
    const response = await axios.get(`${API_BASE_URL}/naver`, {
      params: { url },
      timeout: 30000
    });
    
    const latency = Date.now() - startTime;
    
    stats.total++;
    stats.success++;
    stats.totalLatency += latency;
    stats.minLatency = Math.min(stats.minLatency, latency);
    stats.maxLatency = Math.max(stats.maxLatency, latency);
    
    console.log(`✓ Request ${stats.total}: ${latency}ms`);
    
  } catch (error) {
    const latency = Date.now() - startTime;
    
    stats.total++;
    stats.failed++;
    stats.errors.push({
      url,
      error: error.message,
      latency
    });
    
    console.log(`✗ Request ${stats.total}: Failed (${error.message})`);
  }
}

async function runLoadTest() {
  console.log('🚀 Starting Load Test...');
  console.log(`📊 Target: ${TARGET_REQUESTS} requests`);
  console.log(`⏱️  Duration: 1 hour`);
  console.log('─'.repeat(50));
  
  const startTime = Date.now();
  const endTime = startTime + TEST_DURATION;
  
  // Run requests in parallel with controlled concurrency
  const concurrency = 5; // 5 concurrent requests
  
  while (Date.now() < endTime && stats.total < TARGET_REQUESTS) {
    const batch = Array(concurrency).fill(null).map(() => makeRequest());
    await Promise.all(batch);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Print final statistics
  const totalTime = Date.now() - startTime;
  const avgLatency = stats.totalLatency / stats.success;
  const errorRate = (stats.failed / stats.total) * 100;
  
  console.log('\n' + '='.repeat(50));
  console.log('📈 FINAL STATISTICS');
  console.log('='.repeat(50));
  console.log(`Total Requests: ${stats.total}`);
  console.log(`Successful: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
  console.log(`Average Latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`Min Latency: ${stats.minLatency}ms`);
  console.log(`Max Latency: ${stats.maxLatency}ms`);
  console.log(`Total Time: ${(totalTime / 1000 / 60).toFixed(2)} minutes`);
  console.log('='.repeat(50));
  
  // Check success criteria
  console.log('\n🎯 SUCCESS CRITERIA:');
  console.log(`✓ Requests: ${stats.total >= TARGET_REQUESTS ? 'PASS' : 'FAIL'} (${stats.total}/${TARGET_REQUESTS})`);
  console.log(`✓ Avg Latency: ${avgLatency <= 6000 ? 'PASS' : 'FAIL'} (${avgLatency.toFixed(0)}ms / 6000ms)`);
  console.log(`✓ Error Rate: ${errorRate <= 5 ? 'PASS' : 'FAIL'} (${errorRate.toFixed(2)}% / 5%)`);
  console.log(`✓ Duration: ${totalTime >= 3600000 ? 'PASS' : 'FAIL'} (${(totalTime / 1000 / 60).toFixed(2)}min / 60min)`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  First 5 Errors:`);
    stats.errors.slice(0, 5).forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.error}`);
    });
  }
}

runLoadTest().catch(console.error);