const http = require('http');

const BASE_URL = 'http://localhost:5000';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method: method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING PHANTOMTOUCH BACKEND TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  };

  try {
    // Test 1: Health endpoint check
    console.log('Testing Health Endpoint...');
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200, 'Health endpoint status is 200');
    assert(health.body.status === 'ok', 'Health status content matches "ok"');

    // Test 2: Login as seeded clinician
    console.log('\nTesting Clinician Login...');
    const login = await makeRequest('POST', '/api/auth/login', {}, {
      email: 'doctor@phantomtouch.com',
      password: 'doctor123'
    });
    assert(login.status === 200, 'Login status is 200');
    assert(login.body.token !== undefined, 'Returned token is defined');
    assert(login.body.user?.role === 'CLINICIAN', 'Returned user role is CLINICIAN');

    const token = login.body.token;

    // Test 3: Fetch active profile using token
    console.log('\nTesting Auth Token Resolution (/api/auth/me)...');
    const profile = await makeRequest('GET', '/api/auth/me', {
      'Authorization': `Bearer ${token}`
    });
    assert(profile.status === 200, 'Auth verify status is 200');
    assert(profile.body.profile?.fullName === 'Dr. Sarah Jenkins', 'Resolved profile name matches "Dr. Sarah Jenkins"');

    // Test 4: Fetch patients assigned to clinician
    console.log('\nTesting Patients Retrieval...');
    const patients = await makeRequest('GET', '/api/patients', {
      'Authorization': `Bearer ${token}`
    });
    assert(patients.status === 200, 'Patients fetch status is 200');
    assert(Array.isArray(patients.body), 'Response body is an array');
    assert(patients.body.length > 0, 'Clinician has seeded patients assigned');
    assert(patients.body.some(p => p.fullName === 'Alex Carter'), 'Alex Carter is in the patient list');

    console.log(`\n=== TEST SUITE RESULTS: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n[FATAL ERROR] Testing suite halted due to error:', err.message);
    console.log('Please ensure the backend server is running on http://localhost:5000 before running tests.');
    process.exit(1);
  }
}

runTests();
