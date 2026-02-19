/**
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
    // Simulate connection
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

    // Simulate query execution
    console.log('Executing query:', sql);

    return {
      rows: [],
      rowCount: 0,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
export const db = new Database();

// Helper functions
export async function executeQuery<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function executeUpdate(
  sql: string,
  params?: any[]
): Promise<number> {
  const result = await db.query(sql, params);
  return result.rowCount;
}
