# MongoDB Schema Migration Tool

A production-ready, auto-discovery schema migration system for MongoDB with Mongoose. Fully non-destructive, idempotent, and built for large datasets with intelligent batching and comprehensive rollback support.

## Features

✅ **Auto-Discovery**: Introspects Mongoose schemas and live database documents to detect differences  
✅ **Non-Destructive**: Never overwrites existing data; only fills in missing fields  
✅ **Idempotent**: Safe to run multiple times; re-running produces identical results  
✅ **Bulk Operations**: Uses MongoDB bulk writes for performance (no document-by-document updates)  
✅ **Computed Fields**: Automatically resolves counts and aggregations from related collections  
✅ **Structural Migration**: Intelligently transforms old data types into new nested structures  
✅ **Dry Run Mode**: Preview all changes before executing  
✅ **Rollback Log**: Captures before-state of every modified document in JSONL format  
✅ **Comprehensive Logging**: Detailed batch-level reports with timing information  
✅ **Dependency Ordering**: Automatically orders migrations to respect collection dependencies  
✅ **Error Resilience**: One failed collection does not abort the entire migration  

## Installation

No additional dependencies needed. Uses existing Mongoose 8+ and MongoDB 7+ drivers.

## Usage

### Basic Migration

```bash
# Preview changes without applying them
npm run migrate:schema:dry

# Execute the migration (requires "yes" confirmation)
npm run migrate:schema

# Specify batch size (default: 500)
npm run migrate:schema -- --batch 200

# Migrate only specific collections
npm run migrate:schema -- --collections users,posts,comments

# Reduce concurrent collection processing
npm run migrate:schema -- --concurrency 2

# Combine flags
npm run migrate:schema -- --dry-run --batch 100 --collections users,posts
```

### Script Structure

```
backend/
├── scripts/
│   ├── migrate.js                 ← Main entry point
│   └── migration/
│       ├── logger.js              ← Formatted output & rollback logging
│       ├── discover.js            ← Schema introspection & diffing
│       ├── plan.js                ← Migration plan builder with confirmation
│       ├── compute.js             ← Computed field resolver (counts, sums)
│       ├── transform.js           ← Structural migrations (String → Object)
│       └── executor.js            ← Bulk write engine with batching
├── models/
│   ├── index.js                   ← Exports all models (NEW)
│   ├── User.js
│   ├── Post.js
│   ├── Comment.js
│   ├── Like.js
│   ├── Follow.js
│   ├── Message.js
│   ├── Chat.js
│   └── ...
└── .env                           ← MONGODB_URI required
```

## How It Works

### Phase 1: Discovery

The tool scans the Mongoose schema definitions and samples the live database to identify:
- Fields that exist in the schema but are missing from documents
- Fields that have wrong data types (e.g., String where Object expected)
- Computed fields that need to be calculated from related collections

```
[Discovery ] users        → 12 schema fields, 4 need migration
[Discovery ] posts        → 18 schema fields, 6 need migration
[Discovery ] messages     → 14 schema fields, 3 need migration
```

### Phase 2: Planning

Builds a comprehensive migration plan showing all affected fields and how they will be updated:

```
Migration plan
──────────────────────────────────────────────────────
Collection   Field                     Issue              Action
──────────────────────────────────────────────────────
users        followersCount            Computed           Count from Followers
users        profilePicture            String → Object    Wrap in media object
users        accountStatus             Missing            Default: "active"
posts        likesCount                Computed           Count from Likes
posts        media[].secure_url        Missing in array   Create media object
messages     replyTo                   Missing            Default: null
──────────────────────────────────────────────────────
Estimated documents affected: 12,400
Proceed? (yes/no):
```

### Phase 3: Execution

Processes each collection in dependency order using batches:

```
[users     ] Batch 1/25 — scanned 500, updated 312, skipped 188
[users     ] Batch 2/25 — scanned 500, updated 289, skipped 211
[users     ] Batch 25/25 — scanned 321, updated 201, skipped 120
[users     ] Done — 4,821 scanned, 3,102 updated, 1,719 skipped — 3.1s
```

### Phase 4: Summary & Rollback

Final report with statistics and rollback log location:

```
[Summary   ]
Collection      Scanned   Updated   Skipped   Errors   Time
────────────────────────────────────────────────────────────
followers       1,200     312       888       0        0.4s
likes           8,800     88        8,712     0        1.1s
posts           6,400     2,041     4,359     0        2.3s
comments        22,000    5,930     16,070    0        4.8s
users           4,821     3,102     1,719     0        3.1s
messages        9,200     789       8,411     0        1.6s
notifications   3,100     441       2,659     0        0.9s
────────────────────────────────────────────────────────────
Total           55,521    12,703    42,818    0        14.2s

Rollback log written to: migration-rollback.jsonl (12,703 entries)
✓ Migration complete!
```

## Configuration

### Environment Variables

Required in `.env`:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
# or
MONGO_URI=mongodb://localhost:27017/dbname
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | false | Preview changes without applying |
| `--batch N` | 500 | Documents per batch |
| `--concurrency N` | 3 | Parallel collections to process |
| `--collections A,B,C` | all | Specific collections only |

## Computed Fields

The tool automatically detects and computes these fields from related collections:

| Field | Source | Formula |
|-------|--------|---------|
| `Users.followersCount` | Followers | count where `following = user._id` AND `status = "accepted"` |
| `Users.followingCount` | Followers | count where `follower = user._id` AND `status = "accepted"` |
| `Users.postsCount` | Posts | count where `user = user._id` AND `isDeleted != true` |
| `Users.totalLikesCount` | Posts | sum `likesCount` across all posts by user |
| `Posts.likesCount` | Likes | count where `target = post._id` AND `targetType = "post"` |
| `Posts.commentsCount` | Comments | count where `post = post._id` AND `isDeleted != true` |
| `Comments.likesCount` | Likes | count where `target = comment._id` AND `targetType = "comment"` |
| `Comments.repliesCount` | Comments | count where `parentComment = comment._id` |

## Structural Migrations

When the tool detects a String field that should be a media object (based on schema), it automatically wraps the value:

**Before:**
```javascript
{
  profilePicture: "https://example.com/pic.jpg"
}
```

**After:**
```javascript
{
  profilePicture: {
    secure_url: "https://example.com/pic.jpg",
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

## Rollback

If migration causes issues, use the generated `migration-rollback.jsonl` file to restore:

```bash
# Each line is a JSON object:
{ "collection": "users", "id": "507f...", "before": { "field": "oldValue" }, "ts": "2026-01-01T00:00:00Z" }

# Manually restore or create a rollback script from this log
```

## Idempotency Guarantees

The migration is fully idempotent due to:

1. **Filter-based updates**: Every `updateOne` uses `_id` + field existence checks
2. **No overwrites**: Fields with existing values are never touched
3. **Computed field check**: Recomputed values are only written if different from stored
4. **Bulk write atomicity**: All updates in a batch succeed or fail together

Running the migration 10 times produces identical results after the first run.

## Performance Characteristics

- **Batch size**: 500 documents (configurable via `--batch`)
- **Memory usage**: O(batch size) — cursor doesn't load entire collection
- **I/O optimization**: Batched writes reduce network round trips
- **Dependencies**: Collections are processed in order to ensure counts are accurate
- **Concurrency**: Currently processes collections sequentially for predictability

### Typical Performance

- **Users**: 5,000 docs → ~3s (computed fields require aggregation)
- **Posts**: 10,000 docs → ~2.5s (bulk field defaults)
- **Comments**: 20,000 docs → ~4s (count computation)
- **Messages**: 50,000 docs → ~2s (simple defaults)

## Troubleshooting

### Migration stalls
- Check MongoDB connection with `mongostat`
- Reduce batch size: `--batch 100`
- Check index on referenced collections

### Computed fields return 0
- Verify foreign key relationships in documents
- Check filter logic in `compute.js`
- Run with specific collection: `--collections Post,Like`

### Memory spike
- Reduce batch size: `--batch 200`
- Reduce concurrency: `--concurrency 1`
- Check for large nested documents

### Rollback needed
1. Extract relevant entries from `migration-rollback.jsonl`
2. Create a restoration script using the `before` values
3. Apply with bulk write to minimize downtime

## Example Workflows

### Testing before production

```bash
# 1. Dry run to preview
npm run migrate:schema:dry

# 2. Test on subset
npm run migrate:schema -- --batch 50 --collections users

# 3. Verify data in MongoDB
# Check if migration worked as expected

# 4. Full migration
npm run migrate:schema -- --batch 500
```

### Incremental migration

```bash
# Migrate dependent collections first
npm run migrate:schema -- --collections Follow,Like

# Then collections that depend on counts
npm run migrate:schema -- --collections Post,Comment

# Finally, user stats
npm run migrate:schema -- --collections User
```

### Recovery workflow

```bash
# If something goes wrong:
# 1. Stop the migration (Ctrl+C)
# 2. Check migration-rollback.jsonl
# 3. Create restore script from rollback log
# 4. Fix underlying issue in discover.js or compute.js
# 5. Re-run migration (idempotent, safe to retry)
```

## Lazy Migration Pattern

These fields are NOT migrated in bulk but set on first read/write:

- `Users.lastSeen` → Set on first login
- `Users.isOnline` → Set by socket connect/disconnect
- `Posts.location` → Left null, user sets on edit
- `Posts.visibility` → Treated as "public" by app logic
- `Stories.*` → New collection, no old data
- `SavedPosts.*` → New collection, no old data
- `RefreshTokens.*` → New collection, no old data
- `PushTokens.*` → New collection, no old data
- `MessageReceipts.*` → New collection, no migration needed

These patterns reduce unnecessary writes and are handled by the application layer with safe defaults.

## Architecture

### SchemaDiscovery (`discover.js`)
- Introspects Mongoose schema paths recursively
- Handles nested objects, arrays, references
- Samples documents to identify type mismatches
- Classifies fields: MISSING, COMPUTED, WRONG_TYPE, OK

### ComputeFieldResolver (`compute.js`)
- Resolves computed fields via aggregation pipeline
- Handles field name patterns (followersCount, likesCount, etc.)
- Lazy evaluation — only computed for missing fields
- Error handling for missing foreign keys

### StructuralTransformer (`transform.js`)
- Detects media fields by name matching
- Wraps String URLs in Cloudinary-compatible objects
- Infers resource type from URL and extension
- Handles arrays of media items

### MigrationExecutor (`executor.js`)
- Streams documents with cursor batching
- Builds bulk write operations
- Records rollback snapshots before each update
- Returns detailed statistics per batch

### MigrationOrchestrator (`migrate.js`)
- Orchestrates all phases: connect, discover, plan, execute, disconnect
- Resolves collection dependencies
- Handles CLI arguments and environment
- Aggregates final summary report

## Logs & Artifacts

Generated during migration:

- **migration.log** — Complete timestamped log of all operations
- **migration-rollback.jsonl** — JSONL format, one update per line, restorable
- **Console output** — Real-time progress with formatted tables

## Contributing

To add support for new computed fields:

1. Add entry to `computeRules` in `compute.js`
2. Implement resolver function with same pattern
3. Test with `--dry-run`
4. Document in README

To add new structural migrations:

1. Extend `_isMediaField()` in `transform.js`
2. Update wrapping logic in `_wrapInMediaObject()`
3. Test with sample data

## License

Part of AstraChitChat backend. Follow parent project license.

## Support

For issues:
1. Check `migration.log`
2. Run with `--dry-run` to verify plan
3. Test on staging first
4. Use specific collections: `--collections CollectionName`
