/**
 * VAPID Key Generation Script
 * Story 10.4: Push Notifications Setup
 *
 * Generates VAPID key pair for Web Push API.
 * Run once per environment and store in environment variables.
 *
 * Usage: npx ts-node scripts/generate-vapid-keys.ts
 */

import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();

console.log('\n=== VAPID Keys Generated ===\n');
console.log('Add these to your environment variables:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:support@devos.app');
console.log('\n=== Important Notes ===');
console.log('1. Store the private key securely (never expose to frontend)');
console.log('2. Only regenerate keys if compromised (requires re-subscription)');
console.log('3. Use different keys for development/staging/production\n');
