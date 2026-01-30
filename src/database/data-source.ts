import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'devos',
  password: process.env.DATABASE_PASSWORD || 'devos_password',
  database: process.env.DATABASE_NAME || 'devos_db',
  entities: ['src/database/entities/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // Always false - use migrations
  logging: process.env.NODE_ENV === 'development',
  poolSize: 100, // Max 100 connections per AC
});
