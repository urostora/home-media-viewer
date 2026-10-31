import fs, { existsSync } from 'fs';
import type { FFProbeResult } from 'ffprobe';
import { mediaCommand } from '../mediaCommand';

import { getFullPath } from '../fileHelper';
import { MetadataCollector, type ExtractedMetadata } from './metadata';
import { getDateObject } from '../utils';

import { type File } from '@prisma/client';
import { MetaType } from '../metaUtils';
import { thumbnailSizes } from '../frontend/thumbnailUtils';

// Container images supply the same distribution's media tools on every supported architecture.
const ffprobePath = process.env.FFPROBE_PATH ?? '/usr/bin/ffprobe';
const pathToFfmpeg = process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg';

export const extractVideoMetadata = async (file: File): Promise<ExtractedMetadata> => {
  const metadata = new MetadataCollector();
  const path = getFullPath(file);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  if (!existsSync(ffprobePath)) {
    throw new Error('FFprobe executable not available');
  }

  const videoData = JSON.parse(
    await mediaCommand(ffprobePath, [
      '-v',
      'error',
      '-threads',
      '1',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      path,
    ]),
  ) as FFProbeResult;

  if (typeof videoData !== 'object') {
    throw new Error(`Could not read video metadata at path ${path}`);
  }

  if (!Array.isArray(videoData?.streams) || videoData.streams.length === 0) {
    throw new Error(`Video metadata has no streams at path ${path}`);
  }

  const videoStreams = videoData.streams.filter((s) => s?.codec_type === 'video');
  if (videoStreams.length === 0) {
    throw new Error(`Video metadata has no video streams at path ${path}`);
  }

  const str = videoStreams.shift();

  // add metadata
  let extractedDate: Date | null = null;
  if (typeof str?.tags?.creation_time === 'string') {
    const ts = Date.parse(str.tags.creation_time);
    if (!Number.isNaN(ts)) {
      extractedDate = new Date(ts);
    } else {
      extractedDate = getDateObject(str.tags.creation_time);
    }
  }

  if (extractedDate === null) {
    // get date from file name if available
    const dateFromFilename = getDateObject(file.name);
    if (dateFromFilename !== null && dateFromFilename.getFullYear() > 1990 && dateFromFilename.getFullYear() < 2040) {
      extractedDate = dateFromFilename;
    }
  }

  if (extractedDate != null) {
    metadata.contentDate = extractedDate;
    metadata.addDate(MetaType.DateTime, extractedDate);
  }

  if (typeof str?.tags?.language === 'string') {
    metadata.addString(MetaType.Language, str.tags.language);
  }
  if (typeof str?.codec_name === 'string') {
    metadata.addString(MetaType.Codec, str.codec_name);
  }
  if (typeof str?.codec_long_name === 'string') {
    metadata.addString(MetaType.CodecFullName, str.codec_long_name);
  }
  if (typeof str?.width === 'number') {
    metadata.addInt(MetaType.ResolutionX, Math.round(str.width));
  }
  if (typeof str?.height === 'number') {
    metadata.addInt(MetaType.ResolutionY, Math.round(str.height));
  }

  if (typeof str?.duration === 'number') {
    metadata.addFloat(MetaType.Duration, str.duration);
  } else if (typeof str?.duration === 'string' && str?.duration.length > 0) {
    const durationNumber = Number.parseFloat(str?.duration);
    if (!Number.isNaN(durationNumber)) {
      metadata.addFloat(MetaType.Duration, durationNumber);
    }
  }
  if (typeof str?.bit_rate === 'number') {
    metadata.addInt(MetaType.Bitrate, Math.round(str.bit_rate));
  }

  const customVideoResults = loadCustomVideoData(videoData);
  // Stream creation time retains precedence over container tags and filename dates.
  if (customVideoResults.creationTime !== undefined && typeof str?.tags?.creation_time !== 'string') {
    metadata.contentDate = customVideoResults.creationTime;
    metadata.addDate(MetaType.DateTime, customVideoResults.creationTime);
  }
  if (customVideoResults.model !== undefined) metadata.addString(MetaType.Model, customVideoResults.model);
  if (customVideoResults.manufacturer !== undefined) metadata.addString(MetaType.Make, customVideoResults.manufacturer);
  if (customVideoResults.location !== undefined) {
    metadata.addPosition(MetaType.GpsCoordinates, customVideoResults.location.lat, customVideoResults.location.lon);
  }
  if (customVideoResults.encoder !== undefined) metadata.addString(MetaType.Encoder, customVideoResults.encoder);
  if (customVideoResults.fps !== undefined) metadata.addFloat(MetaType.Fps, customVideoResults.fps);

  return metadata;
};

export const generateVideoThumbnails = async (file: File, outputs: ReadonlyMap<number, string>): Promise<void> => {
  if (!existsSync(pathToFfmpeg)) throw new Error('FFmpeg executable not available');
  const branches = thumbnailSizes.map((_, index) => `[frame${index}]`);
  const filters = [
    `[0:v:0]split=${thumbnailSizes.length}${branches.join('')}`,
    ...thumbnailSizes.map((size, index) => `${branches[index]}scale=${size}:-1[out${index}]`),
  ].join(';');
  const args = [
    '-y',
    '-threads',
    '1',
    '-i',
    getFullPath(file),
    '-filter_complex_threads',
    '1',
    '-filter_complex',
    filters,
  ];
  for (const [index, size] of thumbnailSizes.entries()) {
    const output = outputs.get(size);
    if (output === undefined) throw new Error('Missing thumbnail output');
    // Preserve first-frame selection, width scaling, automatic orientation and MJPEG defaults.
    args.push('-map', `[out${index}]`, '-frames:v', '1', '-threads', '1', output);
  }
  await mediaCommand(pathToFfmpeg, args);
};

const getFpsValue = (fps: string | undefined): number | null => {
  if (typeof fps !== 'string') return null;
  const [numerator, denominator] = fps.split('/').map(Number);
  const value = numerator / denominator;
  return Number.isFinite(value) && value > 0 ? value : null;
};

interface CustomVideoResult {
  model?: string;
  manufacturer?: string;
  location?: {
    lat: number;
    lon: number;
  };
  creationTime?: Date;
  encoder?: string;
  fps?: number;
}

// ffprobe's text report lists container tags before stream tags. Retain that precedence,
// including namespaced QuickTime keys, without parsing presentation text or probing again.
const loadCustomVideoData = (data: FFProbeResult): CustomVideoResult => {
  const ret: CustomVideoResult = {};
  const format = (data as FFProbeResult & { format?: { tags?: Record<string, string> } }).format;
  const tagSets = [format?.tags, ...data.streams.map((stream) => stream.tags)];
  const tag = (key: string): string | undefined => {
    for (const tags of tagSets) {
      const entry = Object.entries(tags ?? {}).find(([name]) => {
        const normalized = name.toLowerCase();
        return normalized === key || normalized.endsWith(`.${key}`);
      });
      if (typeof entry?.[1] === 'string') return entry[1];
    }
    return undefined;
  };
  ret.manufacturer = tag('manufacturer');
  ret.model = tag('model');
  ret.encoder = tag('encoder');
  const creation = tag('creation_time');
  if (creation !== undefined) ret.creationTime = getDateObject(creation) ?? undefined;
  const location = tag('location')?.match(/^(?<lat>[+-][\d.]+)(?<lon>[+-][\d.]+)/);
  if (location?.groups !== undefined) {
    const lat = Number(location.groups.lat);
    const lon = Number(location.groups.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) ret.location = { lat, lon };
  }
  const stream = data.streams.find((stream) => stream.codec_type === 'video');
  ret.fps = getFpsValue(stream?.avg_frame_rate) ?? getFpsValue(stream?.r_frame_rate) ?? undefined;
  return ret;
};
