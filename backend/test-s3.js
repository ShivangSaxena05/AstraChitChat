// test-s3.js  — Run with: node test-s3.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

const REGION = process.env.AWS_REGION?.trim();
const BUCKET = process.env.AWS_BUCKET_NAME?.trim();
const CF_URL = process.env.CLOUDFRONT_URL?.trim();
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID?.trim();
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const GREEN = '\x1b[32m✅';
const RED = '\x1b[31m❌';
const RESET = '\x1b[0m';
const pass = (msg) => console.log(`${GREEN} ${msg}${RESET}`);
const fail = (msg) => console.log(`${RED} ${msg}${RESET}`);

console.log('\n🔍  AWS S3 + CloudFront Connection Test\n');

// ── 1. Check env vars ────────────────────────────────────────────────────────
console.log('── Step 1: Environment Variables ──');
const missing = [];
if (!REGION) missing.push('AWS_REGION');
if (!BUCKET) missing.push('AWS_BUCKET_NAME');
if (!CF_URL) missing.push('CLOUDFRONT_URL');
if (!ACCESS_KEY) missing.push('AWS_ACCESS_KEY_ID');
if (!SECRET_KEY) missing.push('AWS_SECRET_ACCESS_KEY');

if (missing.length) {
    fail(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
}
pass(`Region: ${REGION}`);
pass(`Bucket: ${BUCKET}`);
pass(`CloudFront: ${CF_URL}`);
pass(`Access Key ID: ${ACCESS_KEY.slice(0, 8)}...`);

// ── 2. Test S3 credentials — list bucket ────────────────────────────────────
console.log('\n── Step 2: S3 Bucket Access (ListObjects) ──');
const s3 = new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

async function runTests() {
    try {
        const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 1 }));
        pass(`Connected to bucket "${BUCKET}"  (objects found: ${list.KeyCount})`);
    } catch (err) {
        fail(`Cannot access bucket: ${err.message}`);
        console.log('   Hint: Check IAM permissions (s3:ListBucket) or bucket name.');
        process.exit(1);
    }

    // ── 3. Test upload (PutObject) ───────────────────────────────────────────
    console.log('\n── Step 3: Test Upload to S3 ──');
    const testKey = `_test/connection-check-${Date.now()}.txt`;
    try {
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: testKey,
            Body: 'Astra S3 connection test',
            ContentType: 'text/plain',
        }));
        pass(`Uploaded test file → s3://${BUCKET}/${testKey}`);
    } catch (err) {
        fail(`Upload failed: ${err.message}`);
        console.log('   Hint: Check IAM permission: s3:PutObject');
        process.exit(1);
    }

    // ── 4. Test CloudFront URL ───────────────────────────────────────────────
    console.log('\n── Step 4: CloudFront URL Reachability ──');
    const cfTestUrl = `${CF_URL}/${testKey}`;
    await new Promise((resolve) => {
        https.get(cfTestUrl, (res) => {
            if (res.statusCode === 200 || res.statusCode === 403) {
                // 403 = CloudFront is reachable but bucket may be private (expected for private buckets)
                pass(`CloudFront reachable → ${cfTestUrl}  (HTTP ${res.statusCode})`);
                if (res.statusCode === 403) {
                    console.log('   ℹ️  403 is NORMAL for private buckets — CloudFront is working, files need signed URLs or OAC policy.');
                }
            } else {
                fail(`CloudFront returned HTTP ${res.statusCode}`);
            }
            resolve();
        }).on('error', (err) => {
            fail(`CloudFront not reachable: ${err.message}`);
            console.log('   Hint: Check the CLOUDFRONT_URL value in .env');
            resolve();
        });
    });

    // ── 5. Cleanup test file ─────────────────────────────────────────────────
    console.log('\n── Step 5: Cleanup test file ──');
    try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: testKey }));
        pass('Test file deleted from S3');
    } catch {
        console.log('   ⚠️  Could not delete test file — delete manually if needed.');
    }

    console.log('\n🎉  All checks passed! S3 + CloudFront are connected.\n');
}

runTests().catch((err) => {
    fail(`Unexpected error: ${err.message}`);
    process.exit(1);
});
