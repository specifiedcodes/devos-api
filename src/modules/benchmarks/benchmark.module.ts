/**
 * BenchmarkModule
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Module for model performance tracking, benchmark aggregation, and router feedback.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelPerformance } from '../../database/entities/model-performance.entity';
import { BenchmarkService } from './services/benchmark.service';
import { BenchmarkController } from './controllers/benchmark.controller';
import { PerformanceEventListener } from './listeners/performance-event.listener';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([ModelPerformance]), RedisModule],
  providers: [BenchmarkService, PerformanceEventListener],
  controllers: [BenchmarkController],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}
