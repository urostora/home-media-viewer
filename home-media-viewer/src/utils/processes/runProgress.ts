import type { MediaStage, StageStatistics } from '@/types/processingTypes';
import type { StageResult } from './fileStages';
import type { RunJournal, StageRunSummary } from './runJournal';

export interface MediaProgress {
  initial: (stage: MediaStage, selected: number, pending: number) => Promise<void>;
  started: (stage: MediaStage, first: boolean) => Promise<void>;
  finished: (stage: MediaStage, result: StageResult, durationMs: number) => Promise<void>;
  complete: (stage: MediaStage, counts: StageStatistics, pendingAfter: number) => Promise<void>;
}
const begin = (stage: StageRunSummary): void => {
  stage.startedAt ??= new Date().toISOString();
  stage.inFlight++;
};
const end = (stage: StageRunSummary): void => {
  stage.finishedAt = new Date().toISOString();
  stage.durationMs = Math.max(0, Date.now() - Date.parse(stage.startedAt!));
};
export const mediaProgress = (journal: RunJournal, onFile: () => void): MediaProgress => ({
  initial: async (stage, selected, pending) =>
    journal.change((run) => {
      const value = run.stages[stage]!;
      value.selectedBefore = selected;
      value.pendingBefore = pending;
    }),
  started: async (stage, first) =>
    journal.change((run) => {
      if (first) onFile();
      const value = run.stages[stage]!;
      begin(value);
      value.counts.attempted++;
    }),
  finished: async (stage, result, durationMs) =>
    journal.change((run) => {
      const value = run.stages[stage]!;
      value.inFlight--;
      value.processingMs += durationMs;
      if (result === 'deferred') value.retryable++;
      else value.counts[result]++;
      end(value);
    }),
  complete: async (stage, counts, pendingAfter) =>
    journal.change((run) => {
      const value = run.stages[stage]!;
      value.counts = { ...counts };
      value.pendingAfter = pendingAfter;
      value.remaining = counts.deferred;
    }),
});
export type DiscoveryProgress = (
  counts: StageStatistics,
  directories: number,
  phase: 'initial' | 'started' | 'progress' | 'complete',
  selected?: number,
) => Promise<void>;
export const discoveryProgress =
  (journal: RunJournal, onDirectories: (count: number) => void): DiscoveryProgress =>
  async (counts, directories, phase, selected) =>
    journal.change((run) => {
      const value = run.stages.discovery!;
      onDirectories(directories);
      value.counts = { ...counts };
      if (phase === 'initial') {
        value.selectedBefore = selected!;
        value.pendingBefore = selected!;
        value.startedAt = new Date().toISOString();
      }
      value.inFlight = phase === 'started' ? 1 : 0;
      if (phase === 'progress' || phase === 'complete') end(value);
      if (phase === 'complete') {
        value.pendingAfter = counts.deferred;
        value.remaining = counts.deferred;
        value.retryable = Math.max(0, counts.attempted - counts.succeeded - counts.failed);
        value.processingMs = value.durationMs;
      }
    });
