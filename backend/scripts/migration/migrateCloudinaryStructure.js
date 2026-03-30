/**
 * migrateCloudinaryStructure.js
 * 
 * Migration script to reorganize Cloudinary files from old structure (Astra/)
 * to new structure (myapp/)
 * 
 * Old Structure:
 *   Astra/profile/{userId}
 *   Astra/cover/{userId}
 *   Astra/posts/{userId}
 *   Astra/chat/{chatId}
 * 
 * New Structure:
 *   myapp/images/posts/original/{userId}
 *   myapp/profile/current/{userId}
 *   myapp/profile/history/{userId}
 *   myapp/stories/images/{userId}
 *   myapp/stories/videos/{userId}
 *   myapp/videos/original/{userId}
 *   myapp/flick/original/{userId}
 *   myapp/flick/covers/{userId}
 *   etc...
 * 
 * IMPORTANT: This script PRESERVES all existing data by moving (not deleting) files.
 * Run this script ONCE before deploying the new structure.
 * 
 * Usage: node migrateCloudinaryStructure.js
 */

require('dotenv').config({ path: '../../.env' });
const cloudinary = require('../config/cloudinary');

const OLD_TO_NEW_MAPPING = {
    'Astra/posts': 'myapp/images/posts/original',
    'Astra/profile': 'myapp/profile/current',
    'Astra/cover': 'myapp/profile/current',  // Maps cover to profile/current
    'Astra/chat': 'myapp/chat',  // Legacy chat folder
};

async function getAllResources(folder, maxResults = 500) {
    return new Promise((resolve, reject) => {
        cloudinary.api.resources_by_asset_folder(
            folder,
            { max_results: maxResults, resource_type: 'image', type: 'upload' },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result.resources || []);
                }
            }
        );
    });
}

async function moveFile(sourcePublicId, destinationPublicId) {
    return new Promise((resolve, reject) => {
        cloudinary.api.rename(sourcePublicId, destinationPublicId, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

async function migrateFolder(oldFolder, newFolder) {
    console.log(`\n📂 Migrating folder: ${oldFolder} → ${newFolder}`);
    
    try {
        let allResources = [];
        let nextCursor = null;
        
        // Fetch all resources in the old folder (paginated)
        do {
            const result = await new Promise((resolve, reject) => {
                const options = { max_results: 500, resource_type: 'image', type: 'upload' };
                if (nextCursor) options.next_cursor = nextCursor;
                
                cloudinary.api.resources_by_asset_folder(oldFolder, options, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            
            allResources = allResources.concat(result.resources || []);
            nextCursor = result.next_cursor;
        } while (nextCursor);

        if (allResources.length === 0) {
            console.log(`  ✓ No files found in ${oldFolder}`);
            return 0;
        }

        console.log(`  Found ${allResources.length} files to migrate`);

        let successCount = 0;
        let errorCount = 0;

        // Migrate each file
        for (const resource of allResources) {
            const oldPublicId = resource.public_id;
            const fileName = oldPublicId.split('/').pop();
            
            // Extract userId/chatId from path
            const parts = oldPublicId.split('/');
            const ownerIdIndex = parts.length - 2;
            const ownerId = ownerIdIndex >= 0 ? parts[ownerIdIndex] : 'unknown';
            
            // Construct new public ID
            const newPublicId = `${newFolder}/${ownerId}/${fileName}`;

            try {
                console.log(`  📝 Moving: ${oldPublicId} → ${newPublicId}`);
                await moveFile(oldPublicId, newPublicId);
                successCount++;
                console.log(`  ✓ Success`);
            } catch (err) {
                errorCount++;
                console.error(`  ✗ Error moving ${oldPublicId}: ${err.message}`);
            }
        }

        console.log(`  📊 Migration Summary: ${successCount} success, ${errorCount} errors`);
        return successCount;

    } catch (err) {
        console.error(`Error migrating ${oldFolder}:`, err.message);
        return 0;
    }
}

async function runMigration() {
    console.log('🚀 Starting Cloudinary Structure Migration');
    console.log('=========================================');
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('❌ Error: Cloudinary credentials not configured. Please set CLOUDINARY_* env variables.');
        process.exit(1);
    }

    try {
        let totalMigrated = 0;

        // Migrate each old folder to new structure
        for (const [oldFolder, newFolder] of Object.entries(OLD_TO_NEW_MAPPING)) {
            const count = await migrateFolder(oldFolder, newFolder);
            totalMigrated += count;
        }

        console.log('\n=========================================');
        console.log(`✅ Migration Complete! Total files migrated: ${totalMigrated}`);
        console.log('\n📋 Next Steps:');
        console.log('  1. Update your database references (if storing folder paths)');
        console.log('  2. Test the new media URLs in your application');
        console.log('  3. Deploy the updated backend code');
        console.log('  4. Monitor for any broken media links');
        console.log('\n⚠️  Old files remain in Cloudinary. You can delete them manually after confirming migration success.');

    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    runMigration();
}

module.exports = { migrateFolder, runMigration };
