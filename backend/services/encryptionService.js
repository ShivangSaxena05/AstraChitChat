/**
 * End-to-End Encryption Service
 * 
 * Implements libsodium-based encryption for messages using:
 * - XChaCha20-Poly1305 for symmetric authenticated encryption
 * - Curve25519 for key exchange (DH)
 * - BLAKE2b for hashing
 * 
 * Flow:
 * 1. Each user generates a long-term keypair (stored client-side)
 * 2. Users exchange public keys and derive shared secrets
 * 3. Messages are encrypted with shared secret before sending to server
 * 4. Server stores encrypted messages
 * 5. Only recipient can decrypt using their private key
 */

const sodium = require('libsodium-wrappers');
const crypto = require('crypto');

// Initialize libsodium
let sodiumReady = false;

async function initializeSodium() {
    if (!sodiumReady) {
        await sodium.ready;
        sodiumReady = true;
    }
}

/**
 * Generate a keypair for a user
 * Store private key securely on client-side (e.g., encrypted in secure storage)
 * Store public key on server for key exchange
 * 
 * @returns {Object} { publicKey: string, privateKey: string }
 */
async function generateKeypair() {
    await initializeSodium();
    
    const keypair = sodium.crypto_box_keypair();
    
    return {
        publicKey: sodium.to_base64(keypair.publicKey),
        privateKey: sodium.to_base64(keypair.privateKey)
    };
}

/**
 * Derive a shared secret between sender and receiver
 * Sender uses their private key + receiver's public key
 * 
 * @param {string} senderPrivateKeyBase64 - Base64 encoded private key
 * @param {string} recipientPublicKeyBase64 - Base64 encoded public key
 * @returns {string} Base64 encoded shared secret
 */
async function deriveSharedSecret(senderPrivateKeyBase64, recipientPublicKeyBase64) {
    await initializeSodium();
    
    try {
        const privateKey = sodium.from_base64(senderPrivateKeyBase64);
        const publicKey = sodium.from_base64(recipientPublicKeyBase64);
        
        // Compute shared secret using Elliptic Curve Diffie-Hellman
        const sharedSecret = sodium.crypto_scalarmult(privateKey, publicKey);
        
        return sodium.to_base64(sharedSecret);
    } catch (error) {
        throw new Error(`Failed to derive shared secret: ${error.message}`);
    }
}

/**
 * Encrypt a message using a shared secret
 * Uses XChaCha20-Poly1305 for authenticated encryption
 * 
 * @param {string} plaintext - Message to encrypt
 * @param {string} sharedSecretBase64 - Base64 encoded shared secret (32 bytes)
 * @returns {Object} { ciphertext: string, nonce: string, encryptionMethod: string }
 */
async function encryptMessage(plaintext, sharedSecretBase64) {
    await initializeSodium();
    
    try {
        // Decode shared secret
        const sharedSecret = sodium.from_base64(sharedSecretBase64);
        
        if (sharedSecret.length !== 32) {
            throw new Error(`Shared secret must be 32 bytes, got ${sharedSecret.length}`);
        }
        
        // Generate random nonce (24 bytes for XChaCha20)
        const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        
        // Encrypt the message
        const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
            plaintext,
            null,  // additional data (optional)
            null,  // secret key placeholder (using sharedSecret instead)
            nonce,
            sharedSecret
        );
        
        return {
            ciphertext: sodium.to_base64(ciphertext),
            nonce: sodium.to_base64(nonce),
            encryptionMethod: 'xchacha20-poly1305'
        };
    } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt a message using a shared secret
 * 
 * @param {string} ciphertextBase64 - Base64 encoded ciphertext
 * @param {string} nonceBase64 - Base64 encoded nonce
 * @param {string} sharedSecretBase64 - Base64 encoded shared secret (32 bytes)
 * @returns {string} Decrypted plaintext
 */
async function decryptMessage(ciphertextBase64, nonceBase64, sharedSecretBase64) {
    await initializeSodium();
    
    try {
        const ciphertext = sodium.from_base64(ciphertextBase64);
        const nonce = sodium.from_base64(nonceBase64);
        const sharedSecret = sodium.from_base64(sharedSecretBase64);
        
        if (sharedSecret.length !== 32) {
            throw new Error(`Shared secret must be 32 bytes, got ${sharedSecret.length}`);
        }
        
        if (nonce.length !== sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) {
            throw new Error(`Invalid nonce length: ${nonce.length}`);
        }
        
        // Decrypt the message
        const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,  // secret key placeholder
            ciphertext,
            null,  // additional data
            nonce,
            sharedSecret
        );
        
        return sodium.to_string(plaintext);
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

/**
 * Hash a value using BLAKE2b
 * Useful for deriving keys or creating fingerprints
 * 
 * @param {string} input - Input string
 * @param {number} outputLength - Output hash length in bytes (default: 32)
 * @returns {string} Base64 encoded hash
 */
async function hashValue(input, outputLength = 32) {
    await initializeSodium();
    
    const hash = sodium.crypto_generichash(outputLength, input);
    return sodium.to_base64(hash);
}

/**
 * Create a key fingerprint for verification
 * Users can compare fingerprints to verify they're talking to the right person
 * 
 * @param {string} publicKeyBase64 - Base64 encoded public key
 * @returns {string} Readable fingerprint (first 16 chars of base64 hash)
 */
async function createKeyFingerprint(publicKeyBase64) {
    await initializeSodium();
    
    const hash = await hashValue(publicKeyBase64, 16);
    // Return a human-readable format: XXXX-XXXX-XXXX-XXXX
    return hash.substring(0, 16)
        .match(/.{1,4}/g)
        .join('-')
        .toUpperCase();
}

/**
 * Verify that a ciphertext hasn't been tampered with
 * (Already checked by Poly1305 authentication tag, but useful for debugging)
 * 
 * @param {string} ciphertextBase64
 * @param {string} nonceBase64
 * @param {string} sharedSecretBase64
 * @returns {boolean}
 */
async function verifyCiphertext(ciphertextBase64, nonceBase64, sharedSecretBase64) {
    try {
        await decryptMessage(ciphertextBase64, nonceBase64, sharedSecretBase64);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Perform key rotation
 * Generate new keypair and securely rotate to new one
 * 
 * @returns {Object} { oldPublicKey: string, newPublicKey: string, newPrivateKey: string }
 */
async function rotateKeypair(oldPublicKeyBase64) {
    await initializeSodium();
    
    const newKeypair = await generateKeypair();
    
    return {
        oldPublicKey: oldPublicKeyBase64,
        newPublicKey: newKeypair.publicKey,
        newPrivateKey: newKeypair.privateKey,
        rotatedAt: new Date()
    };
}

/**
 * Export public key for sharing with contacts
 * Server stores this to enable key exchange
 * 
 * @param {string} publicKeyBase64
 * @returns {Object} Public key metadata
 */
function exportPublicKey(publicKeyBase64) {
    return {
        publicKey: publicKeyBase64,
        algorithm: 'curve25519',
        format: 'base64',
        createdAt: new Date()
    };
}

module.exports = {
    generateKeypair,
    deriveSharedSecret,
    encryptMessage,
    decryptMessage,
    hashValue,
    createKeyFingerprint,
    verifyCiphertext,
    rotateKeypair,
    exportPublicKey,
    initializeSodium
};
