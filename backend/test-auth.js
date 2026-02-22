(async () => {
  try {
    const base = 'http://localhost:5000';
    const timestamp = Date.now();
    const email = `test.user${timestamp}@example.com`;

    // Register
    const registerResp = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email, password: 'Password123' })
    });
    const registerJson = await registerResp.json().catch(() => ({ status: registerResp.status }));
    console.log('REGISTER RESPONSE:', JSON.stringify(registerJson, null, 2));

    // Login
    const loginResp = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123' })
    });
    const loginJson = await loginResp.json().catch(() => ({ status: loginResp.status }));
    console.log('LOGIN RESPONSE:', JSON.stringify(loginJson, null, 2));
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exitCode = 1;
  }
})();
