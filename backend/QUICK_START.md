# Schema Migration Quick Start Guide

Get your MongoDB database migrated in 5 minutes.

## Prerequisites

✅ Node.js 18+  
✅ Mongoose 8+  
✅ MongoDB 7+  
✅ Environment variable: `MONGODB_URI` or `MONGO_URI`  

## Step 1: Preview the Migration (Dry Run)

```bash
cd backend

# See what will change WITHOUT making any changes
npm run migrate:schema:dry
```

Expected output:
```
[Discovery ] Scanning 11 collections...
[Discovery ] users        → 18 schema fields, 6 need migration
[Discovery ] posts        → 15 schema fields, 4 need migration
...

Migration plan
──────────────────────────────────────────────────
Collection   Field                Issue              
──────────────────────────────────────────────────
users        followersCount       Computed           
users        profilePicture       String → Object    
posts        likesCount           Computed           
...

Estimated documents affected: 12,400
```

Review the output. If the plan looks good, proceed to step 2.

## Step 2: Execute the Migration

```bash
# Run the actual migration
npm run migrate:schema

# When prompted, type: yes
# ➜ Proceed with migration? (yes/no): yes
```

Watch the progress:
```
[users     ] Batch 1/25 — scanned 500, updated 312, skipped 188
[users     ] Batch 2/25 — scanned 500, updated 289, skipped 211
...
[users     ] Done — 4,821 scanned, 3,102 updated, 1,719 skipped — 3.1s

[Summary   ]
Collection      Scanned   Updated   Skipped   Errors   Time
────────────────────────────────────────────────────────────
users           4,821     3,102     1,719     0        3.1s
posts           6,400     2,041     4,359     0        2.3s
...
────────────────────────────────────────────────────────────
Total           55,521    12,703    42,818    0        14.2s

✓ Migration complete! 12,703 documents updated.
```

## Step 3: Integrate Lazy Defaults

Add these utilities to your controllers to ensure proper defaults for fields not backfilled:

### In User Controller

```javascript
const { applyUserDefaults, serializeUser } = require('../utils/lazyDefaults');

exports.getUserProfile = async (req, res) => {
  let user = await User.findById(req.params.userId);
  user = applyUserDefaults(user);  // Apply lazy defaults
  res.json(serializeUser(user));   // Send safe object to client
};

exports.listUsers = async (req, res) => {
  const users = await User.find().limit(20).lean();
  const result = users
    .map(u => applyUserDefaults(u))
    .map(u => serializeUser(u));
  res.json(result);
};
```

### In Post Controller

```javascript
const { applyPostDefaults, serializePost } = require('../utils/lazyDefaults');

exports.getPost = async (req, res) => {
  let post = await Post.findById(req.params.postId);
  post = applyPostDefaults(post);
  res.json(serializePost(post));
};

exports.listPosts = async (req, res) => {
  const posts = await Post.find().limit(20).lean();
  const result = posts
    .map(p => applyPostDefaults(p))
    .map(p => serializePost(p));
  res.json(result);
};
```

### In Socket.io

```javascript
const { 
  handleUserConnect, 
  handleUserDisconnect 
} = require('../utils/lazyDefaults');

io.on('connection', (socket) => {
  handleUserConnect(socket.userId);  // User came online
  
  socket.on('disconnect', () => {
    handleUserDisconnect(socket.userId);  // User went offline
  });
});
```

## Step 4: Verify Everything Works

```bash
# Start your server
npm run dev

# Test an endpoint (in another terminal)
curl http://localhost:5000/api/users/me

# Should return user with all defaults:
{
  "_id": "...",
  "name": "John",
  "followersCount": 42,    # ← computed
  "isOnline": false,       # ← lazy default
  "lastSeen": "2026-01-01T12:00:00Z",  # ← lazy default
  ...
}

# Check logs to ensure no errors
tail -f migration.log
```

## Rollback (If Something Goes Wrong)

If the migration causes issues:

```bash
# All before-states are saved in:
cat migration-rollback.jsonl

# Each line is a JSON object with "before" values
# You can manually create a restore script if needed
```

## File Locations

```
backend/
├── scripts/
│   ├── migrate.js                    ← Run this
│   └── migration/
│       ├── logger.js
│       ├── discover.js
│       ├── plan.js
│       ├── compute.js
│       ├── transform.js
│       └── executor.js
├── utils/
│   └── lazyDefaults.js              ← Import from here
├── examples/
│   ├── controllerIntegration.js     ← See examples
│   └── socketIntegration.js         ← See examples
├── SCHEMA_MIGRATION_GUIDE.md        ← Full docs
└── scripts/
    └── MIGRATION_README.md          ← Technical details
```

## Common Tasks

### Migrate Only Specific Collections

```bash
npm run migrate:schema -- --collections users,posts

# Or:
npm run migrate:schema -- --collections Follow,Like
```

### Use Smaller Batches (for slow DB)

```bash
npm run migrate:schema -- --batch 200
```

### Reduce Concurrent Processing

```bash
npm run migrate:schema -- --concurrency 1
```

### Combine Options

```bash
npm run migrate:schema -- --dry-run --batch 100 --collections users,posts
```

## What Gets Migrated?

### ✅ Automatically Backfilled (during migration)

- **Counts**: `followersCount`, `followingCount`, `postsCount`, `likesCount`, etc.
- **Defaults**: `isDeleted`, `isPrivate`, `hashtags`, `status`, etc.
- **Structural**: String URLs wrapped in media objects

### ⚠️ Lazy Defaults (on first use, not during migration)

- **Users**: `isOnline`, `lastSeen`
- **Posts**: `visibility`, `location`
- **Messages**: Treated as "text" if no attachments

See `SCHEMA_MIGRATION_GUIDE.md` for complete list.

## Performance Notes

- **Small DB** (< 10k docs): ~5-10s
- **Medium DB** (50k docs): ~20-40s
- **Large DB** (200k docs): ~60-120s

If slow:
1. Reduce batch size: `--batch 100`
2. Check MongoDB logs
3. Run during off-peak hours

## Next Steps

1. ✅ Read full docs: `SCHEMA_MIGRATION_GUIDE.md`
2. ✅ Check examples: `examples/controllerIntegration.js`
3. ✅ Review computed fields: `scripts/migration/compute.js`
4. ✅ Monitor production: `tail -f migration.log`

## Support

- Check logs: `cat migration.log`
- Dry run: `npm run migrate:schema:dry`
- See full guide: `SCHEMA_MIGRATION_GUIDE.md`
- See technical details: `scripts/MIGRATION_README.md`

---

**All set?** Now run: `npm run migrate:schema:dry` to preview your migration! 🚀
