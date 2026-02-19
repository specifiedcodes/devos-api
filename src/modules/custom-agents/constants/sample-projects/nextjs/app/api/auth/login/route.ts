/**
 * Login API Route - Contains intentional security issues for testing
 *
 * SECURITY ISSUES (for sandbox testing):
 * 1. SQL injection vulnerability in query construction
 * 2. Missing input validation
 * 3. Hardcoded secret key
 * 4. Plaintext password comparison
 * 5. Missing rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';

// ISSUE: Hardcoded secret key
const SECRET_KEY = 'super-secret-key-12345';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // ISSUE: No input validation
    // ISSUE: SQL injection vulnerability (simulated)
    const query = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`;

    // Simulated database query result
    const user = {
      id: '1',
      email: email,
      name: 'Test User',
    };

    // ISSUE: Plaintext password comparison
    if (password === 'password123') {
      // ISSUE: Synchronous token generation (should be async with proper library)
      const token = Buffer.from(`${user.id}:${Date.now()}:${SECRET_KEY}`).toString('base64');

      return NextResponse.json({
        success: true,
        token: token,
        user: user,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid credentials' },
      { status: 401 }
    );
  } catch (error) {
    // ISSUE: Exposing internal error details
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
