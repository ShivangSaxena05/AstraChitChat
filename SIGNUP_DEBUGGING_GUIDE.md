# Signup Debugging Guide

## Quick Checklist

### Frontend
- [ ] Check console logs when clicking "Sign Up" button
- [ ] Verify API_URL in `services/config.ts` is correct
- [ ] Check if network request is being made (Network tab in DevTools)
- [ ] Check error message displayed to user

### Backend
- [ ] Check if backend server is running
- [ ] Check backend logs for errors
- [ ] Verify MongoDB connection is active
- [ ] Check if .env file has JWT_SECRET and MONGO_URI

### Common Issues & Solutions

---

## Issue 1: "Network Error - Please check your internet connection"

**Causes**:
1. Backend server is not running
2. Wrong API_URL in frontend config
3. CORS issues
4. Firewall/proxy blocking the connection

**Solutions**:
```bash
# 1. Check if backend is running
curl https://astrachitchat.onrender.com/api/auth/register -X POST

# 2. If local testing, start the backend:
cd backend
npm start

# 3. Check CORS settings in server.js
# Ensure CLIENT_URL or SOCKET_ORIGINS includes your frontend URL
```

**Frontend Config** (`services/config.ts`):
```typescript
// For LOCAL testing, change to:
export const API_URL = 'http://localhost:5000/api';

// For PRODUCTION:
export const API_URL = 'https://astrachitchat.onrender.com/api';
```

---

## Issue 2: "User with this email already exists"

**Causes**:
1. Email was already registered
2. Duplicate signup attempt

**Solutions**:
```typescript
// Use a different email
// OR clear the database for testing:
// In MongoDB Atlas, delete the user collection
```

---

## Issue 3: "Please provide a valid email address"

**Causes**:
1. Email doesn't have @ symbol
2. Email doesn't have a domain extension
3. Email has spaces

**Solutions**:
```typescript
// Valid emails:
✅ user@example.com
✅ user+tag@example.com
✅ user.name@company.co.uk

// Invalid emails:
❌ userexample.com (missing @)
❌ user@example (missing extension)
❌ user @example.com (has space)
```

---

## Issue 4: "Password must be at least 8 characters" / "Password must contain uppercase, lowercase, and numbers"

**Causes**:
1. Password is too short (less than 8 chars)
2. Password doesn't have uppercase letters
3. Password doesn't have lowercase letters
4. Password doesn't have numbers

**Solutions**:
```typescript
// Valid passwords:
✅ MyPassword123
✅ Secure@Pass2024
✅ ComplexP@ssw0rd

// Invalid passwords:
❌ password (no uppercase, no number, too short)
❌ PASSWORD123 (no lowercase)
❌ password123 (no uppercase)
```

---

## Issue 5: "Invalid response from server: missing token or user ID"

**Causes**:
1. Backend didn't return token
2. Backend didn't return user ID
3. Backend returned an error wrapped in success response

**Solutions**:

Check backend logs for actual error:
```bash
# Backend logs should show something like:
# "User created: userId=xxx, token=yyy"
# 
# If not, check:
# 1. Is User.create() succeeding?
# 2. Is generateToken() working?
# 3. Check MongoDB for the new user
```

---

## Issue 6: "Too many auth attempts, please try again later"

**Causes**:
1. Exceeded rate limit (20 requests per 15 minutes for auth routes)
2. Register endpoint is being rate limited

**Solutions**:
```bash
# Wait 15 minutes for the rate limit to reset, OR

# Change rate limit in server.js:
# Increase 'max' value or remove rate limiting for /register

# The backend now skips rate limiting for /register, 
# so this should only affect login attempts
```

---

## Issue 7: Stuck on Loading / No Response

**Causes**:
1. Network timeout (15 seconds)
2. Backend is processing slowly
3. MongoDB is slow

**Solutions**:
```bash
# 1. Check backend is responding:
curl https://astrachitchat.onrender.com/api/test/db

# 2. Check MongoDB connection
# In server.js logs, should see:
# "MongoDB Atlas connected"

# 3. Increase timeout in services/api.ts if needed:
timeout: 30000, // 30 seconds instead of 15
```

---

## Debugging Steps (Step by Step)

### Step 1: Enable Debug Logging
```typescript
// Add to signup.tsx
console.log('🔄 Signup request:', { name, email });
// Then watch the console
```

### Step 2: Check Network Request
```
Open Developer Tools → Network tab
Click "Sign Up" button
Look for the POST request to /auth/register
Check:
  - Status code (should be 201 for success)
  - Request body (should have name, email, password)
  - Response body (should have token and user data)
```

### Step 3: Check Backend Logs
```bash
# Terminal where backend is running should show:
# "[POST] /api/auth/register"
# "✅ User registered: userId=xxx"
# 
# If not, there's an error in the backend
```

### Step 4: Test with curl
```bash
# Test signup directly from command line:
curl -X POST https://astrachitchat.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "testuser@example.com",
    "password": "TestPassword123"
  }'

# Response should be (201 Created):
# {
#   "_id": "xxx",
#   "token": "eyJxxx...",
#   "username": "testuser123",
#   "email": "testuser@example.com",
#   "name": "Test User",
#   "profilePicture": "..."
# }
```

---

## Logs to Check

### Frontend Logs (React Native / Expo)
```
Look for:
✅ "🔄 Signup request: {...}"
✅ "✅ Signup response: {...}"

Or errors:
❌ "❌ Signup error: {...}"
❌ Network error messages
```

### Backend Logs (Node.js)
```
Look for:
✅ "A user connected via socket"
✅ "[POST] /api/auth/register"
✅ "User validated"

Or errors:
❌ "User already exists"
❌ "MongoDB connection error"
❌ "Could not generate unique username"
```

---

## Configuration Checklist

### Frontend (.env or config.ts)
```
✅ API_URL is set correctly
✅ API_URL is reachable (can test with curl)
✅ Socket URL matches API domain
```

### Backend (.env)
```
✅ MONGO_URI is set
✅ JWT_SECRET is set
✅ NODE_ENV is set (development or production)
✅ CLIENT_URL is set to frontend URL (for CORS)
```

### MongoDB
```
✅ MongoDB Atlas cluster is running
✅ Network access allows your IP
✅ Database exists and is not full
✅ User collection is accessible
```

---

## Advanced Debugging

### Enable More Verbose Logging

**Frontend (signup.tsx)**:
```typescript
// Add detailed logging before each operation
console.log('Step 1: Validation...');
console.log('Step 2: API Call...');
console.log('Step 3: Storage...');
console.log('Step 4: Socket...');
console.log('Step 5: Navigation...');
```

**Backend (authController.js)**:
```javascript
exports.registerUser = asyncHandler(async (req, res) => {
  console.log('📥 Received signup request:', { body: req.body });
  
  // ... validation ...
  console.log('✅ Validation passed');
  
  // ... create user ...
  console.log('✅ User created:', user);
  
  // ... generate token ...
  console.log('✅ Token generated');
  
  res.json(...);
});
```

---

## Success Indicators

When signup is working correctly, you should see:

**Frontend**:
```
✅ Input validation passes
✅ "🔄 Signup request:" log appears
✅ "✅ Signup response:" log appears with token
✅ User is redirected to home page
✅ Saved accounts are updated in AsyncStorage
```

**Backend**:
```
✅ "[POST] /api/auth/register" request received
✅ Validation checks pass
✅ User created in MongoDB
✅ Response sent with 201 status
```

**Database**:
```
✅ New user document in MongoDB
✅ Password is hashed (not plain text)
✅ Username is unique
✅ Email is lowercase
```

---

## Next Steps

1. **Check the fixes applied**:
   - Better email regex validation
   - Improved error messages
   - Rate limiting adjusted
   - Enhanced logging

2. **Test the signup flow**:
   - Open frontend
   - Fill in signup form
   - Watch console logs
   - Check backend logs
   - Verify user in MongoDB

3. **If still failing**:
   - Collect console logs
   - Collect backend logs
   - Run curl test
   - Check network tab
   - Share error message

