export class ProcessingOptionsError extends Error {}

export const processingStages = ['discovery', 'metadata', 'thumbnails'] as const;
export type ProcessingStage = (typeof processingStages)[number];
export type MediaStage = Exclude<ProcessingStage, 'discovery'>;

export interface ProcessingOptions {
  stages?: ProcessingStage[];
  mode?: 'pending' | 'refresh';
  albumId?: string;
  fileId?: string;
  timeoutSec?: number;
  workers?: number;
}

export interface StageStatistics {
  attempted: number;
  succeeded: number;
  failed: number;
  notSupported: number;
  deferred: number;
}

export const emptyStageStatistics = (): StageStatistics => ({
  attempted: 0,
  succeeded: 0,
  failed: 0,
  notSupported: 0,
  deferred: 0,
});

export const validateProcessingOptions = (
  value: unknown,
): Required<Pick<ProcessingOptions, 'stages' | 'mode'>> & ProcessingOptions => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ProcessingOptionsError('Processing options must be an object');
  const data = value as Record<string, unknown>;
  const allowed = ['stages', 'mode', 'albumId', 'fileId', 'timeoutSec', 'workers'];
  if (Object.keys(data).some((key) => !allowed.includes(key)))
    throw new ProcessingOptionsError('Unknown processing option');
  const stages = data.stages === undefined ? [...processingStages] : data.stages;
  if (
    !Array.isArray(stages) ||
    stages.length === 0 ||
    new Set(stages).size !== stages.length ||
    stages.some((stage) => !processingStages.includes(stage))
  )
    throw new ProcessingOptionsError('Invalid processing stages');
  const mode = data.mode === undefined ? 'pending' : data.mode;
  if (mode !== 'pending' && mode !== 'refresh') throw new ProcessingOptionsError('Invalid processing mode');
  for (const field of ['albumId', 'fileId']) {
    if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) {
      throw new ProcessingOptionsError(`Invalid ${field}`);
    }
  }
  if (data.albumId !== undefined && data.fileId !== undefined)
    throw new ProcessingOptionsError('Choose albumId or fileId');
  if (data.fileId !== undefined && stages.includes('discovery'))
    throw new ProcessingOptionsError('Discovery requires an album or library scope');
  for (const [field, maximum] of [
    ['timeoutSec', 600],
    ['workers', 4],
  ] as const) {
    const entry = data[field];
    if (
      entry !== undefined &&
      (typeof entry !== 'number' ||
        !Number.isFinite(entry) ||
        entry < 1 ||
        entry > maximum ||
        (field === 'workers' && !Number.isInteger(entry)))
    )
      throw new ProcessingOptionsError(`Invalid ${field}`);
  }
  return { ...data, stages: processingStages.filter((stage) => stages.includes(stage)), mode } as Required<
    Pick<ProcessingOptions, 'stages' | 'mode'>
  > &
    ProcessingOptions;
};
