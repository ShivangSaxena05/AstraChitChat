# Schema Migration Integration Guide

Complete guide for integrating the auto-discovery schema migration into your AstraChitChat backend.

## Quick Start

### 1. Prepare Environment

```bash
# Ensure .env has MongoDB connection
cat backend/.env
# Should contain: MONGODB_URI=mongodb+srv://...
```

### 2. Test Migration

```bash
cd backend

# Preview what will change (no database modifications)
npm run migrate:schema:dry

# Review the plan output and log file
cat migration.log
```

### 3. Execute Migration

```bash
# Run the actual migration (will ask for confirmation)
npm run migrate:schema

# If successful, review the rollback log
cat migration-rollback.jsonl
```

### 4. Integrate Lazy Defaults into Application

Add lazy default handlers to your controllers and middleware:

```javascript
// In your controller or middleware
const { 
  applyUserDefaults, 
  serializeUser,
  handleUserConnect,
  handleUserDisconnect 
} = require('../utils/lazyDefaults');

// When fetching user
app.get('/api/user/:id', async (req, res) => {
  let user = await User.findById(req.params.id);
  user = applyUserDefaults(user);  // Apply lazy defaults
  res.json(serializeUser(user));   // Return safe DTO
});

// In socket.io connection handler
io.on('connection', (socket) => {
  handleUserConnect(socket.userId);
  
  socket.on('disconnect', () => {
    handleUserDisconnect(socket.userId);
  });
});
```

## Migration Phases Explained

### Phase 1: Auto-Discovery

The migration tool scans your MongoDB collections and compares against the Mongoose schemas to identify:

- **Missing fields**: Fields defined in schema but absent from documents
- **Wrong types**: Fields that exist but are the wrong data type
- **Computed fields**: Fields that should be calculated from other collections (like counts)

**Example output:**
```
[Discovery ] Scanning 11 collections...
[Discovery ] users        → 18 schema fields, 6 need migration
[Discovery ] posts        → 15 schema fields, 4 need migration
[Discovery ] comments     → 9 schema fields, 2 need migration
[Discovery ] likes        → 6 schema fields, 1 needs migration
[Discovery ] followers    → 4 schema fields, 2 need migration
[Discovery ] messages     → 16 schema fields, 3 need migration
[Discovery ] chats        → 12 schema fields, 1 needs migration
```

### Phase 2: Plan Generation

Generates a detailed migration plan showing exactly what will change:

```
Migration plan
──────────────────────────────────────────────────────────────────
Collection   Field                   Issue              Affected Docs
──────────────────────────────────────────────────────────────────
users        followersCount          Computed           4,821
users        followingCount          Computed           4,821
users        postsCount              Computed           4,821
users        totalLikesCount         Computed           4,821
users        profilePicture          String → Object    1,203
posts        likesCount              Computed           6,400
posts        commentsCount           Computed           6,400
posts        media                   String → Object    2,041
comments     likesCount              Computed           22,000
comments     repliesCount            Computed           22,000
follows      status                  Default: accepted  1,200
messages     isDeleted               Default: false     9,200
──────────────────────────────────────────────────────────────────
Total estimated affected: 73,121 documents
Proceed? (yes/no):
```

### Phase 3: Execution

Processes collections in dependency order using batch operations:

```
[followers ] Batch 1/3 — scanned 500, updated 312, skipped 188
[followers ] Batch 2/3 — scanned 500, updated 289, skipped 211
[followers ] Batch 3/3 — scanned 200, updated 101, skipped 99
[followers ] Done — 1,200 scanned, 702 updated, 498 skipped — 0.4s

[likes     ] Batch 1/18 — scanned 500, updated 88, skipped 412
[likes     ] Batch 2/18 — scanned 500, updated 76, skipped 424
...
[likes     ] Done — 8,800 scanned, 1,288 updated, 7,512 skipped — 1.1s

[posts     ] Batch 1/13 — scanned 500, updated 412, skipped 88
...
[posts     ] Done — 6,400 scanned, 2,041 updated, 4,359 skipped — 2.3s
```

### Phase 4: Summary Report

```
[Summary   ]
Collection      Scanned   Updated   Skipped   Errors   Time
────────────────────────────────────────────────────────────
followers       1,200     702       498       0        0.4s
likes           8,800     1,288     7,512     0        1.1s
posts           6,400     2,041     4,359     0        2.3s
comments        22,000    5,930     16,070    0        4.8s
users           4,821     3,102     1,719     0        3.1s
messages        9,200     789       8,411     0        1.6s
chats           3,100     441       2,659     0        0.9s
────────────────────────────────────────────────────────────
Total           55,521    13,293    42,228    0        14.2s

✓ Migration complete! 13,293 documents updated.
Rollback log written to: migration-rollback.jsonl (13,293 entries)
```

## Field Migration Details

### Computed Fields (Auto-Calculated)

These fields are computed by counting or summing from related collections:

#### Users Collection

| Field | Source | Logic |
|-------|--------|-------|
| `followersCount` | Followers | COUNT where `following = user._id` AND `status = "accepted"` |
| `followingCount` | Followers | COUNT where `follower = user._id` AND `status = "accepted"` |
| `postsCount` | Posts | COUNT where `user = user._id` AND `isDeleted != true` |
| `totalLikesCount` | Posts | SUM of `likesCount` across all user's posts |

Example: A user with 50 posts, 8 of which have likes, and 432 total likes across them gets:
```javascript
{
  postsCount: 50,
  totalLikesCount: 432,
  followersCount: 1203,
  followingCount: 892,
}
```

#### Posts Collection

| Field | Source | Logic |
|-------|--------|-------|
| `likesCount` | Likes | COUNT where `target = post._id` AND `targetType = "post"` |
| `commentsCount` | Comments | COUNT where `post = post._id` AND `isDeleted != true` |

#### Comments Collection

| Field | Source | Logic |
|-------|--------|-------|
| `likesCount` | Likes | COUNT where `target = comment._id` AND `targetType = "comment"` |
| `repliesCount` | Comments | COUNT where `parentComment = comment._id` |

### Structural Migrations (Type Transformations)

Some fields change from simple types to nested objects. The tool automatically wraps existing values:

#### Example: Profile Picture

**Before Migration** (old schema):
```javascript
{
  _id: ObjectId("..."),
  name: "John Doe",
  profilePicture: "https://example.com/john.jpg"
}
```

**After Migration** (new schema):
```javascript
{
  _id: ObjectId("..."),
  name: "John Doe",
  profilePicture: {
    secure_url: "https://example.com/john.jpg",
    public_id: null,
    resource_type: "image",
    format: "jpg",
    version: null,
    width: null,
    height: null,
    duration: null,
    thumbnail_url: null
  }
}
```

The original URL is preserved in `secure_url`, and metadata fields are set to `null` (to be populated when user re-uploads).

#### Applied to These Fields

- `Users.profilePicture` — User avatar
- `Users.coverPhoto` — User cover/banner image
- `Chats.groupAvatar` — Group chat avatar
- `Posts.media[]` — Each item in posts array
- `Messages.attachments[]` — Each message attachment

### Default Fields (Simple Values)

Fields missing from documents are set to schema defaults:

| Collection | Field | Default | Reason |
|------------|-------|---------|--------|
| Users | `isPrivate` | false | Public profile by default |
| Users | `isVerified` | false | No verification on creation |
| Posts | `isDeleted` | false | Posts start active |
| Posts | `hashtags` | [] | Empty array if none |
| Posts | `sharesCount` | 0 | No shares initially |
| Posts | `savedCount` | 0 | No saves initially |
| Posts | `viewsCount` | 0 | No views initially |
| Comments | `isDeleted` | false | Comments start active |
| Comments | `parentComment` | null | Top-level comments |
| Messages | `replyTo` | null | Not a reply by default |
| Messages | `replyPreview` | null | No reply preview |
| Messages | `isDeleted` | false | Messages active |
| Messages | `deletedFor` | [] | Not deleted for anyone |
| Messages | `msgType` | inferred | "text" if no attachments |
| Followers | `status` | "accepted" | Old data assumed direct follows |
| Followers | `updatedAt` | copy from `createdAt` | Preserve creation time |
| Likes | `targetType` | "post" | Old schema only had post likes |

## Lazy Migration Pattern

Some fields should NOT be backfilled during migration. Instead, they're set on first use:

### Why Skip These Fields?

1. **Unnecessary writes**: Data that naturally populates through normal usage
2. **Real-time data**: Things that change frequently (like `isOnline`)
3. **New collections**: Fields that didn't exist in the old schema

### Fields Using Lazy Migration

#### Users Collection

- `lastSeen` — Set to current time on first login or API call after migration
- `isOnline` — Managed by socket.io connect/disconnect handlers

#### Posts Collection

- `location` — Null by default; user sets when editing
- `visibility` — Treated as "public" by application logic
- `viewsCount` — Derived from analytics, set on first view

#### Stories Collection (entirely new)

No migration needed. All new stories created after migration will have complete data.

#### SavedPosts Collection (entirely new)

No migration needed. Populated by user interactions only.

#### RefreshTokens, PushTokens (entirely new)

No migration needed. Created during authentication and device registration.

#### MessageReceipts (entirely new)

No migration needed. Old messages simply have no receipts (acceptable).

#### Reports (entirely new)

No migration needed. Only new reports created after migration.

### How Lazy Defaults Work

In your application layer, when returning a User:

```javascript
// Before returning to client
let user = await User.findById(userId);

// Apply lazy defaults in memory
if (!user.lastSeen) user.lastSeen = new Date();
if (!user.isOnline) user.isOnline = false;

// Fire-and-forget update to database (non-blocking)
User.updateOne({ _id: user._id }, { $set: { lastSeen: new Date(), isOnline: false } })
  .exec()
  .catch(err => console.error('Lazy default error:', err));

// Return enriched user to client
return serializeUser(user);
```

See `utils/lazyDefaults.js` for complete implementation patterns.

## Integration Checklist

### Pre-Migration

- [ ] Backup MongoDB database
- [ ] Test migration with `npm run migrate:schema:dry`
- [ ] Review `migration.log` for expected changes
- [ ] Run migration on staging environment first
- [ ] Verify data integrity on staging

### Post-Migration Application Integration

- [ ] Import `utils/lazyDefaults.js` utilities
- [ ] Add `applyUserDefaults()` to all user fetch operations
- [ ] Add `serializeUser()` to all API responses
- [ ] Update socket.io handlers with `handleUserConnect/Disconnect()`
- [ ] Add lazy default middleware to protected routes
- [ ] Test all user-facing endpoints
- [ ] Monitor logs for lazy default errors

### Testing After Migration

```javascript
// Test 1: Verify computed fields
const user = await User.findById(userId);
assert(user.followersCount >= 0);
assert(user.postsCount >= 0);
assert(user.totalLikesCount >= 0);

// Test 2: Verify structural migrations
const post = await Post.findById(postId);
assert(typeof post.media === 'object' || Array.isArray(post.media));
if (post.profilePicture) {
  assert(typeof post.profilePicture === 'object');
  assert(post.profilePicture.secure_url);
}

// Test 3: Verify lazy defaults work
let freshUser = await User.findById(userId);
freshUser = applyUserDefaults(freshUser);
assert(freshUser.isOnline !== undefined);
assert(freshUser.lastSeen !== undefined);

// Test 4: Verify idempotency
await migration.run(); // First run
const firstResults = new Map(migration.results);

await migration.run(); // Second run
const secondResults = new Map(migration.results);

assert.deepEqual(firstResults, secondResults);
```

## Rollback Procedure

If something goes wrong during migration:

### Scenario 1: Migration Errors Out

No data was changed. Simply:

1. Fix the underlying issue in `scripts/migration/` files
2. Run migration again (it's idempotent)

### Scenario 2: Migration Succeeds But Data is Incorrect

Use the rollback log:

```bash
# Each line in migration-rollback.jsonl is:
# {"collection":"users","id":"507f...","before":{"field":"oldValue"},"ts":"2026-01-01T00:00:00Z"}

# Option 1: Manually create a restoration script
cat > restore.js << 'EOF'
const fs = require('fs');
const mongoose = require('mongoose');
const models = require('./models');

async function restore() {
  const lines = fs.readFileSync('migration-rollback.jsonl', 'utf-8').split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const { collection, id, before } = JSON.parse(line);
    await models[collection].updateOne({ _id: id }, { $set: before });
  }
}
EOF

node restore.js
```

### Scenario 3: Partial Rollback Needed

Extract specific entries from the rollback log:

```bash
# Get rollback entries for just users collection
grep '"collection":"users"' migration-rollback.jsonl > users-rollback.jsonl

# Extract specific document IDs
grep '"id":"507f1f77bcf86cd799439011"' migration-rollback.jsonl > specific-rollback.jsonl
```

## Monitoring & Logs

### Log Locations

- **Console output** — Real-time progress
- **migration.log** — Timestamped full log
- **migration-rollback.jsonl** — JSONL format, one entry per update

### Log Analysis

```bash
# Count documents updated by collection
grep "Done —" migration.log | awk '{print $2, $4}'

# Find errors during migration
grep ERROR migration.log

# Get total migration time
tail -5 migration.log
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Migration stalls | Large collection, slow DB | Reduce batch size: `--batch 100` |
| Memory spike | Loading too many docs | Reduce batch size or concurrency |
| Computed fields = 0 | Foreign key mismatch | Verify relationships in models |
| Type errors on structural migration | Unexpected data type | Check schema definition against data |
| Rollback file is huge | Many documents updated | Check if migration is idempotent |

## Performance Optimization

### Tuning Parameters

```bash
# Small collections, fast DB
npm run migrate:schema -- --batch 1000 --concurrency 5

# Large collections, slow/busy DB
npm run migrate:schema -- --batch 200 --concurrency 1

# Test run on staging
npm run migrate:schema:dry

# Specific collections only
npm run migrate:schema -- --collections users,posts
```

### Timeline for Typical Deployments

| Metric | Small DB | Medium DB | Large DB |
|--------|----------|-----------|----------|
| Total docs | ~10k | ~50k | ~200k |
| Migration time | 5-10s | 20-40s | 60-120s |
| CPU usage | < 10% | 20-30% | 40-60% |
| Memory usage | 50-100MB | 150-250MB | 300-500MB |

### Scaling to Large Datasets

For production deployments with millions of documents:

1. **Pre-warming**: Run on read replica first to cache data
2. **Off-peak**: Schedule migration during low-traffic periods
3. **Batch tuning**: Start with `--batch 200`, adjust based on performance
4. **Concurrency**: Keep at 1 for very large databases
5. **Monitoring**: Watch MongoDB metrics during migration

## Deployment Workflow

### Step-by-Step Production Deployment

```bash
# 1. On staging environment
cd backend
npm run migrate:schema:dry
# Review migration.log

npm run migrate:schema
# Type "yes" when prompted
# Verify data integrity

# 2. Verify all endpoints still work
npm test

# 3. Check lazy default integration
npm run server &
# Manual test: call API endpoints, check logs

# 4. On production
# a. Schedule maintenance window (if needed)
# b. Backup database
mongodump --uri="$MONGODB_URI" --out=backup-$(date +%s)

# c. Run migration
npm run migrate:schema
# Type "yes" when prompted

# d. Verify critical endpoints
curl https://api.example.com/health

# e. Monitor logs
tail -f logs/application.log
tail -f migration.log
```

## Support & Troubleshooting

### Getting Help

1. Check `migration.log` for specific errors
2. Run with `--dry-run` to verify the plan is correct
3. Test on staging environment
4. Verify `.env` has correct `MONGODB_URI`

### Common Error Messages

```
"MONGODB_URI is not set"
→ Add MONGODB_URI to backend/.env

"Connection timed out"
→ Check MongoDB network access, firewall rules

"Bulk write error"
→ Reduce batch size, check for duplicate indexes

"Out of memory"
→ Reduce batch size or concurrency
```

## Next Steps

1. Run the dry-run: `npm run migrate:schema:dry`
2. Review the migration plan
3. Execute on staging: `npm run migrate:schema`
4. Integrate lazy defaults into controllers
5. Deploy to production with monitoring

---

**Need help?** Check the detailed README in `scripts/MIGRATION_README.md`
