/**
 * Sample Projects Index
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Exports sample project files for sandbox testing.
 * Each project contains intentional issues for testing agent capabilities.
 */

import { SandboxSampleProject } from '../../../../database/entities/agent-sandbox-session.entity';

export interface SampleProjectFile {
  path: string;
  content: string;
  language: string;
}

// Sample project files are defined inline to avoid TSX import issues

/**
 * Get all files for a sample project type
 */
export function getSampleProjectFiles(
  projectType: SandboxSampleProject,
): SampleProjectFile[] {
  switch (projectType) {
    case SandboxSampleProject.NEXTJS:
      return getNextJsFiles();
    case SandboxSampleProject.EXPRESS:
      return getExpressFiles();
    case SandboxSampleProject.PYTHON:
      return getPythonFiles();
    case SandboxSampleProject.REACT:
      return getReactFiles();
    case SandboxSampleProject.CUSTOM:
      return [];
    default:
      return getNextJsFiles();
  }
}

function getNextJsFiles(): SampleProjectFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'sample-nextjs-app',
        version: '1.0.0',
        description: 'Sample Next.js application for sandbox testing',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'next lint',
        },
        dependencies: {
          next: '14.0.0',
          react: '18.2.0',
          'react-dom': '18.2.0',
        },
        devDependencies: {
          '@types/node': '20.0.0',
          '@types/react': '18.2.0',
          '@types/react-dom': '18.2.0',
          typescript: '5.0.0',
        },
      }, null, 2),
      language: 'json',
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'es5',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }, null, 2),
      language: 'json',
    },
    {
      path: 'app/layout.tsx',
      content: `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sample App',
  description: 'A sample Next.js application for testing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
      language: 'typescript',
    },
    {
      path: 'app/page.tsx',
      content: `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">Sample Next.js App</h1>
      <p className="text-lg text-gray-600">
        This is a sample application for sandbox testing.
      </p>
    </main>
  );
}
`,
      language: 'typescript',
    },
    {
      path: 'app/api/auth/login/route.ts',
      content: `/**
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
    const query = \`SELECT * FROM users WHERE email = '\${email}' AND password = '\${password}'\`;

    // Simulated database query result
    const user = {
      id: '1',
      email: email,
      name: 'Test User',
    };

    // ISSUE: Plaintext password comparison
    if (password === 'password123') {
      const token = Buffer.from(\`\${user.id}:\${Date.now()}:\${SECRET_KEY}\`).toString('base64');

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
`,
      language: 'typescript',
    },
    {
      path: 'app/api/users/route.ts',
      content: `/**
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
  return [
    { id: '1', name: 'User 1', email: 'user1@example.com' },
    { id: '2', name: 'User 2', email: 'user2@example.com' },
    { id: '3', name: 'User 3', email: 'user3@example.com' },
  ];
}

async function getUserPosts(userId: string) {
  return [
    { id: \`\${userId}-post-1\`, title: \`Post 1 by User \${userId}\` },
    { id: \`\${userId}-post-2\`, title: \`Post 2 by User \${userId}\` },
  ];
}

export async function GET(request: NextRequest) {
  try {
    // ISSUE: No pagination - fetches all users
    const users = await getUsers();

    // ISSUE: N+1 query pattern - for each user, we make a separate query
    const usersWithPosts = await Promise.all(
      users.map(async (user) => {
        const posts = await getUserPosts(user.id);
        return { ...user, posts, postCount: posts.length };
      })
    );

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
`,
      language: 'typescript',
    },
    {
      path: 'lib/db.ts',
      content: `/**
 * Database utility module
 *
 * Contains a simulated database connection for sandbox testing.
 */

interface QueryResult {
  rows: any[];
  rowCount: number;
}

class Database {
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    console.log('Database connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('Database disconnected');
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    console.log('Executing query:', sql);
    return { rows: [], rowCount: 0 };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const db = new Database();

export async function executeQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function executeUpdate(sql: string, params?: any[]): Promise<number> {
  const result = await db.query(sql, params);
  return result.rowCount;
}
`,
      language: 'typescript',
    },
  ];
}

function getExpressFiles(): SampleProjectFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'sample-express-app',
        version: '1.0.0',
        description: 'Sample Express application for sandbox testing',
        main: 'dist/index.js',
        scripts: {
          build: 'tsc',
          start: 'node dist/index.js',
          dev: 'ts-node src/index.ts',
        },
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          '@types/express': '^4.17.0',
          typescript: '^5.0.0',
          'ts-node': '^10.0.0',
        },
      }, null, 2),
      language: 'json',
    },
    {
      path: 'src/index.ts',
      content: `import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// ISSUE: Missing CORS configuration
// ISSUE: Missing rate limiting
// ISSUE: Missing helmet for security headers

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ISSUE: No input validation
app.post('/api/users', (req: Request, res: Response) => {
  const { name, email } = req.body;
  // ISSUE: SQL injection vulnerability
  const query = \`INSERT INTO users (name, email) VALUES ('\${name}', '\${email}')\`;
  res.json({ success: true, name, email });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
      language: 'typescript',
    },
  ];
}

function getPythonFiles(): SampleProjectFile[] {
  return [
    {
      path: 'requirements.txt',
      content: `flask>=2.0.0
python-dotenv>=1.0.0
gunicorn>=21.0.0
`,
      language: 'text',
    },
    {
      path: 'app/main.py',
      content: `from flask import Flask, request, jsonify
import os

app = Flask(__name__)

# ISSUE: Hardcoded secret key
app.secret_key = 'hardcoded-secret-key-12345'

# ISSUE: Debug mode enabled in production
DEBUG = True

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')

    # ISSUE: No input validation
    # ISSUE: SQL injection vulnerability
    query = f"INSERT INTO users (name, email) VALUES ('{name}', '{email}')"
    print(f"Executing: {query}")

    return jsonify({'success': True, 'name': name, 'email': email})

# ISSUE: No error handling
@app.route('/api/users/<user_id>')
def get_user(user_id):
    # ISSUE: No authorization check
    # ISSUE: SQL injection
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return jsonify({'id': user_id, 'name': 'Test User'})

if __name__ == '__main__':
    # ISSUE: Debug mode in production
    app.run(debug=DEBUG, host='0.0.0.0', port=5000)
`,
      language: 'python',
    },
  ];
}

function getReactFiles(): SampleProjectFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'sample-react-app',
        version: '1.0.0',
        private: true,
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          'react-scripts': '5.0.0',
        },
        scripts: {
          start: 'react-scripts start',
          build: 'react-scripts build',
          test: 'react-scripts test',
        },
      }, null, 2),
      language: 'json',
    },
    {
      path: 'src/App.tsx',
      content: `import React, { useState, useEffect } from 'react';

// ISSUE: No error boundaries
// ISSUE: No loading states
function App() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');

  // ISSUE: Missing dependency array
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data));
  });

  // ISSUE: No input validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ISSUE: XSS vulnerability - no sanitization
    await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  };

  return (
    <div>
      <h1>Users</h1>
      {/* ISSUE: Using index as key */}
      {users.map((user: any, index: number) => (
        <div key={index}>
          {/* ISSUE: Potential XSS */}
          <span dangerouslySetInnerHTML={{ __html: user.name }} />
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={name} onChange={e => setName(e.target.value)} />
        <button type="submit">Add User</button>
      </form>
    </div>
  );
}

export default App;
`,
      language: 'typescript',
    },
  ];
}

/**
 * Get a specific file from a sample project
 */
export function getSampleProjectFile(
  projectType: SandboxSampleProject,
  filePath: string,
): SampleProjectFile | null {
  const files = getSampleProjectFiles(projectType);
  return files.find((f) => f.path === filePath) || null;
}

/**
 * Get sample project file paths (for directory listing)
 */
export function getSampleProjectFilePaths(
  projectType: SandboxSampleProject,
): string[] {
  const files = getSampleProjectFiles(projectType);
  return files.map((f) => f.path);
}
