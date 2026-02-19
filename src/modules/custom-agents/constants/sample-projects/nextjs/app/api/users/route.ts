/**
 * Users List API Route - Contains intentional N+1 query pattern for testing
 *
 * PERFORMANCE ISSUES (for sandbox testing):
 * 1. N+1 query pattern - fetches users then makes separate query for each user's posts
 * 2. Missing pagination
 * 3. No caching headers
 */

import { NextRequest, NextResponse } from 'next/server';

// Simulated database functions
async function getUsers() {
  // Simulates: SELECT * FROM users
  return [
    { id: '1', name: 'User 1', email: 'user1@example.com' },
    { id: '2', name: 'User 2', email: 'user2@example.com' },
    { id: '3', name: 'User 3', email: 'user3@example.com' },
    { id: '4', name: 'User 4', email: 'user4@example.com' },
    { id: '5', name: 'User 5', email: 'user5@example.com' },
  ];
}

async function getUserPosts(userId: string) {
  // Simulates: SELECT * FROM posts WHERE user_id = ?
  // This is called N times in a loop, creating N+1 queries
  return [
    { id: `${userId}-post-1`, title: `Post 1 by User ${userId}` },
    { id: `${userId}-post-2`, title: `Post 2 by User ${userId}` },
  ];
}

export async function GET(request: NextRequest) {
  try {
    // ISSUE: No pagination - fetches all users
    const users = await getUsers();

    // ISSUE: N+1 query pattern - for each user, we make a separate query
    const usersWithPosts = await Promise.all(
      users.map(async (user) => {
        // This creates N additional queries where N = number of users
        const posts = await getUserPosts(user.id);
        return {
          ...user,
          posts,
          postCount: posts.length,
        };
      })
    );

    // ISSUE: Missing database indexes would make this slower
    // ISSUE: No caching headers set
    return NextResponse.json({
      success: true,
      data: usersWithPosts,
      total: usersWithPosts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// CORRECT IMPLEMENTATION (for comparison):
// async function GET_CORRECT() {
//   // Single query with JOIN to get users and posts together
//   const usersWithPosts = await db.query(`
//     SELECT u.*, p.id as post_id, p.title as post_title
//     FROM users u
//     LEFT JOIN posts p ON u.id = p.user_id
//   `);
//   // Then group results in application code
// }
