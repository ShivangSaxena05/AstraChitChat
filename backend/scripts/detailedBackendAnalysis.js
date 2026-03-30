#!/usr/bin/env node
/**
 * detailedBackendAnalysis.js
 * 
 * Deep analysis of backend code, looking for:
 * - Integration issues
 * - Missing implementations
 * - Potential bugs
 * - Configuration issues
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║         COMPREHENSIVE BACKEND CODE ANALYSIS & AUDIT            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const backendDir = path.join(__dirname, '..');
let issuesFound = 0;
let warningsFound = 0;
let successCount = 0;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: CHECK CONTROLLER INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 1: CONTROLLER INTEGRATIONS');
console.log('─────────────────────────────────────────────────────────────────\n');

const controllerChecks = [
    { file: 'controllers/postController.js', functions: ['createPost', 'uploadMedia'] },
    { file: 'controllers/profileController.js', functions: ['uploadProfilePicture'] },
    { file: 'controllers/chatController.js', functions: ['uploadChatMedia'] },
];

controllerChecks.forEach(({ file, functions }) => {
    const filePath = path.join(backendDir, file);
    if (!fs.existsSync(filePath)) {
        console.log(`  ❌ Missing: ${file}`);
        issuesFound++;
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let funcStatus = 0;
        
        functions.forEach(func => {
            if (content.includes(func)) {
                console.log(`  ✅ ${file} → ${func}()`);
                funcStatus++;
            } else {
                console.log(`  ⚠️  ${file} → Missing: ${func}()`);
                warningsFound++;
            }
        });
        successCount++;
    } catch (err) {
        console.log(`  ❌ Error reading ${file}: ${err.message}`);
        issuesFound++;
    }
});

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: ROUTE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 2: ROUTE CONFIGURATION');
console.log('─────────────────────────────────────────────────────────────────\n');

const routeChecks = [
    { file: 'routes/postRoutes.js', pattern: 'upload.*single|multipart' },
    { file: 'routes/profileRoutes.js', pattern: 'upload.*profile' },
    { file: 'routes/chatRoutes.js', pattern: 'upload.*media' },
];

routeChecks.forEach(({ file, pattern }) => {
    const filePath = path.join(backendDir, file);
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  Not found (optional): ${file}`);
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('multer') || content.includes('upload')) {
            console.log(`  ✅ ${file} → Multer configured`);
            successCount++;
        } else {
            console.log(`  ⚠️  ${file} → Multer not found (may use global middleware)`);
            warningsFound++;
        }
    } catch (err) {
        console.log(`  ❌ Error reading ${file}: ${err.message}`);
        issuesFound++;
    }
});

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MIDDLEWARE CHAIN
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 3: MIDDLEWARE CHAIN VERIFICATION');
console.log('─────────────────────────────────────────────────────────────────\n');

try {
    const authMiddleware = fs.readFileSync(path.join(backendDir, 'middleware/auth.js'), 'utf8');
    if (authMiddleware.includes('jwt') || authMiddleware.includes('token')) {
        console.log('  ✅ Authentication middleware present');
        successCount++;
    } else {
        console.log('  ⚠️  Authentication middleware may be incomplete');
        warningsFound++;
    }
} catch (err) {
    console.log(`  ❌ Cannot read auth middleware: ${err.message}`);
    issuesFound++;
}

try {
    const uploadMiddleware = fs.readFileSync(path.join(backendDir, 'middleware/uploadMiddleware.js'), 'utf8');
    console.log('  ✅ Upload middleware file exists');
    successCount++;
} catch (err) {
    console.log('  ⚠️  uploadMiddleware.js not found (may use direct multer import)');
    warningsFound++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: DATABASE MODEL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 4: DATABASE MODEL INTEGRATION');
console.log('─────────────────────────────────────────────────────────────────\n');

const modelChecks = [
    { file: 'models/Post.js', fields: ['image', 'media', 'cloudinary'] },
    { file: 'models/User.js', fields: ['profilePicture', 'avatar', 'photo'] },
    { file: 'models/Chat.js', fields: ['media', 'attachment'] },
];

modelChecks.forEach(({ file, fields }) => {
    const filePath = path.join(backendDir, file);
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  Not found: ${file}`);
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let fieldFound = false;
        
        fields.forEach(field => {
            if (content.includes(field)) {
                console.log(`  ✅ ${file} → Has field: ${field}`);
                fieldFound = true;
                successCount++;
            }
        });
        
        if (!fieldFound) {
            console.log(`  ⚠️  ${file} → No media fields found`);
            warningsFound++;
        }
    } catch (err) {
        console.log(`  ❌ Error reading ${file}: ${err.message}`);
        issuesFound++;
    }
});

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: CLOUDINARY SERVICE USAGE
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 5: CLOUDINARY SERVICE USAGE');
console.log('─────────────────────────────────────────────────────────────────\n');

const getMediaServiceUsage = (dirPath) => {
    const files = [];
    const filesInDir = fs.readdirSync(dirPath, { recursive: true });
    
    filesInDir.forEach(file => {
        if (file.endsWith('.js') && !file.includes('node_modules')) {
            files.push(path.join(dirPath, file));
        }
    });
    
    return files;
};

try {
    const controllerPath = path.join(backendDir, 'controllers');
    const controllers = getMediaServiceUsage(controllerPath);
    
    let usageCount = 0;
    controllers.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes('mediaService') || content.includes('uploadToCloudinary')) {
                console.log(`  ✅ Using mediaService: ${path.basename(file)}`);
                usageCount++;
                successCount++;
            }
        } catch (err) {
            // Skip files that can't be read
        }
    });
    
    if (usageCount === 0) {
        console.log('  ⚠️  mediaService not used in controllers (check if uploads work)');
        warningsFound++;
    }
} catch (err) {
    console.log(`  ❌ Error checking mediaService usage: ${err.message}`);
    issuesFound++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 6: ERROR HANDLING VERIFICATION');
console.log('─────────────────────────────────────────────────────────────────\n');

try {
    const asyncHandler = fs.readFileSync(path.join(backendDir, 'controllers/asyncHandler.js'), 'utf8');
    if (asyncHandler.includes('catch') || asyncHandler.includes('try')) {
        console.log('  ✅ Async error handler implemented');
        successCount++;
    }
} catch (err) {
    console.log('  ⚠️  asyncHandler.js not found');
    warningsFound++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: SECURITY CHECKS
// ═══════════════════════════════════════════════════════════════════════════

console.log('📋 SECTION 7: SECURITY CONFIGURATION');
console.log('─────────────────────────────────────────────────────────────────\n');

try {
    const server = fs.readFileSync(path.join(backendDir, 'server.js'), 'utf8');
    
    if (server.includes('helmet')) {
        console.log('  ✅ Helmet.js (security headers) configured');
        successCount++;
    } else {
        console.log('  ❌ Helmet.js not configured');
        issuesFound++;
    }
    
    if (server.includes('cors')) {
        console.log('  ✅ CORS middleware configured');
        successCount++;
    } else {
        console.log('  ❌ CORS not configured');
        issuesFound++;
    }
    
    if (server.includes('rateLimit')) {
        console.log('  ✅ Rate limiting configured');
        successCount++;
    } else {
        console.log('  ⚠️  Rate limiting not configured');
        warningsFound++;
    }
} catch (err) {
    console.log(`  ❌ Cannot check security: ${err.message}`);
    issuesFound++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('═════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS SUMMARY');
console.log('═════════════════════════════════════════════════════════════════\n');

const total = successCount + warningsFound + issuesFound;
const healthScore = Math.round((successCount / total) * 100);

console.log(`✅ Passed: ${successCount}`);
console.log(`⚠️  Warnings: ${warningsFound}`);
console.log(`❌ Issues: ${issuesFound}`);
console.log(`─────────────────────`);
console.log(`📈 Health Score: ${healthScore}%\n`);

if (healthScore >= 90) {
    console.log('🎉 EXCELLENT! Backend is well-configured and ready for deployment.');
} else if (healthScore >= 70) {
    console.log('✅ GOOD! Backend is functional. Address warnings for production.');
} else if (healthScore >= 50) {
    console.log('⚠️  CAUTION! Several issues should be addressed before deployment.');
} else {
    console.log('❌ CRITICAL! Major issues found. Fix before deployment.');
}

console.log('\n═════════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

if (issuesFound > 0) {
    console.log('🔧 RECOMMENDED FIXES:\n');
    
    if (issuesFound > 0) {
        console.log('1. Install missing dependencies: npm install');
        console.log('2. Verify all controller functions exist');
        console.log('3. Check that multer middleware is properly connected');
    }
    
    if (warningsFound > 0) {
        console.log('\n⚠️  Additional recommendations:');
        console.log('- Ensure uploadMiddleware.js is properly integrated');
        console.log('- Verify all model fields match API expectations');
        console.log('- Test media upload endpoints');
    }
    
    console.log('\n');
}

console.log('✨ Analysis complete!\n');
