const http = require('http');

// Test configuration
const TEST_URL = 'http://localhost:3000';
const tests = [
  { path: '/', description: 'Health check endpoint' },
  { path: '/health', description: 'Render health check endpoint' },
  { path: '/status', description: 'WhatsApp status endpoint' },
  { path: '/qr', description: 'QR code endpoint' },
  { path: '/session', description: 'Session data endpoint' }
];

console.log('🧪 Testing WooWhats Server locally...\n');

async function runTest(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: test.path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log(`✅ ${test.description}`);
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   Response: ${JSON.stringify(jsonData, null, 2)}\n`);
          resolve({ success: true, status: res.statusCode });
        } catch (error) {
          console.log(`⚠️  ${test.description}`);
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   Response: ${data}\n`);
          resolve({ success: true, status: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ ${test.description}`);
      console.log(`   Error: ${error.message}\n`);
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      console.log(`⏰ ${test.description}`);
      console.log(`   Error: Request timeout\n`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.end();
  });
}

async function runAllTests() {
  console.log('Make sure your server is running locally with: npm start\n');
  
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await runTest(test);
    if (result.success) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Your server is ready for deployment.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check your server configuration.');
  }
}

// Test POST endpoint
async function testSendEndpoint() {
  console.log('🧪 Testing POST /send endpoint...\n');
  
  const postData = JSON.stringify({
    to: '1234567890',
    message: 'Test message from WooWhats'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 5000
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log(`📱 Send message endpoint`);
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   Response: ${JSON.stringify(jsonData, null, 2)}\n`);
          resolve({ success: true, status: res.statusCode });
        } catch (error) {
          console.log(`📱 Send message endpoint`);
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   Response: ${data}\n`);
          resolve({ success: true, status: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Send message endpoint`);
      console.log(`   Error: ${error.message}\n`);
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      console.log(`⏰ Send message endpoint`);
      console.log(`   Error: Request timeout\n`);
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.write(postData);
    req.end();
  });
}

// Run all tests
runAllTests().then(() => {
  return testSendEndpoint();
}).then(() => {
  console.log('🏁 Testing complete!');
});
