/**
 * Type augmentation for Bull Job to include updateProgress method.
 * Bull's progress() method is sometimes called as updateProgress() in the codebase.
 */
import 'bull';

declare module 'bull' {
  interface Job<T = any> {
    updateProgress(value: number | object): Promise<void>;
  }
}
