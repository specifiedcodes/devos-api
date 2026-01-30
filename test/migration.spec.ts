import { AppDataSource } from '../src/database/data-source';

describe('Migration System', () => {
  describe('DataSource Configuration', () => {
    it('should have correct database configuration', () => {
      expect(AppDataSource.options.type).toBe('postgres');
      expect(AppDataSource.options.database).toBeDefined();
    });

    it('should have entities configured', () => {
      const options = AppDataSource.options as any;
      expect(options.entities).toBeDefined();
      expect(Array.isArray(options.entities)).toBe(true);
      expect(options.entities.length).toBeGreaterThan(0);
    });

    it('should have migrations configured', () => {
      const options = AppDataSource.options as any;
      expect(options.migrations).toBeDefined();
      expect(Array.isArray(options.migrations)).toBe(true);
    });

    it('should have synchronize disabled', () => {
      const options = AppDataSource.options as any;
      expect(options.synchronize).toBe(false);
    });

    it('should have connection pool configured with max 100 connections', () => {
      const options = AppDataSource.options as any;
      expect(options.poolSize).toBe(100);
    });

    it('should enable logging in development mode', () => {
      const options = AppDataSource.options as any;
      if (process.env.NODE_ENV === 'development') {
        expect(options.logging).toBe(true);
      }
    });
  });

  describe('Initial Migration Structure', () => {
    it('should export AppDataSource as DataSource instance', () => {
      expect(AppDataSource).toBeDefined();
      expect(AppDataSource.constructor.name).toBe('DataSource');
    });

    it('should use environment variables for database connection', () => {
      const options = AppDataSource.options as any;

      // Should default to localhost if not set
      expect(options.host).toBeDefined();

      // Should default to 5432 if not set
      expect(options.port).toBeDefined();
      expect(typeof options.port).toBe('number');
    });
  });
});
