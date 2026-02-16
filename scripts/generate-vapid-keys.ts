#!/usr/bin/env ts-node
/**
 * VAPID Key Generation Script
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (enhanced with rotation timestamp)
 *
 * Generates a VAPID key pair for Web Push notifications.
 * Usage: npx ts-node scripts/generate-vapid-keys.ts
 *
 * Output: VAPID public and private keys in env-ready format.
 */

import * as webPush from 'web-push';

function generateVapidKeys(): void {
  const keys = webPush.generateVAPIDKeys();

  console.log('');
  console.log('=== VAPID Key Pair Generated ===');
  console.log('');
  console.log('Add these to your .env file:');
  console.log('');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log(`VAPID_SUBJECT=mailto:admin@devos.app`);
  console.log(`VAPID_LAST_ROTATED=${new Date().toISOString()}`);
  console.log('');
  console.log('IMPORTANT:');
  console.log('- Keep VAPID_PRIVATE_KEY secret. Never commit it to version control.');
  console.log('- The VAPID_PUBLIC_KEY is safe to expose to clients.');
  console.log('- Rotating keys will invalidate all existing push subscriptions.');
  console.log('- After rotation, clients must re-subscribe with the new public key.');
  console.log('');
}

generateVapidKeys();
