import fs, { existsSync } from 'fs';
import type { FFProbeResult } from 'ffprobe';
import { mediaCommand } from '../mediaCommand';

import { getFullPath, updateContentDate, updateThumbnailDate } from '../fileHelper';
import { addDateMeta, addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from '../metaHelper';
import { getDateObject } from '../utils';
import { getFileThumbnailPath } from '../thumbnailHelper';

import { type File } from '@prisma/client';
import { type FileProcessor } from './processorFactory';
import { MetaType } from '../metaUtils';
import { thumbnailSizes } from '../frontend/thumbnailUtils';

// Container images supply the same distribution's media tools on every supported architecture.
const ffprobePath = process.env.FFPROBE_PATH ?? '/usr/bin/ffprobe';
const pathToFfmpeg = process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg';

const videoFileProcessor: FileProcessor = async (file: File): Promise<boolean> => {
  const path = getFullPath(file);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  if (!existsSync(ffprobePath)) {
    throw new Error('FFprobe executable not available');
  }

  const videoData = JSON.parse(
    await mediaCommand(ffprobePath, ['-v', 'quiet', '-print_format', 'json', '-show_streams', path]),
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
    await updateContentDate(file, extractedDate);
    await addDateMeta(file, MetaType.DateTime, extractedDate);
  }

  if (typeof str?.tags?.language === 'string') {
    await addStringMeta(file, MetaType.Language, str.tags.language);
  }
  if (typeof str?.codec_name === 'string') {
    await addStringMeta(file, MetaType.Codec, str.codec_name);
  }
  if (typeof str?.codec_long_name === 'string') {
    await addStringMeta(file, MetaType.CodecFullName, str.codec_long_name);
  }
  if (typeof str?.width === 'number') {
    await addIntMeta(file, MetaType.ResolutionX, Math.round(str.width));
  }
  if (typeof str?.height === 'number') {
    await addIntMeta(file, MetaType.ResolutionY, Math.round(str.height));
  }

  if (typeof str?.duration === 'number') {
    await addFloatMeta(file, MetaType.Duration, str.duration);
  } else if (typeof str?.duration === 'string' && str?.duration.length > 0) {
    const durationNumber = Number.parseFloat(str?.duration);
    if (!Number.isNaN(durationNumber)) {
      await addFloatMeta(file, MetaType.Duration, durationNumber);
    }
  }
  if (typeof str?.bit_rate === 'number') {
    await addIntMeta(file, MetaType.Bitrate, Math.round(str.bit_rate));
  }

  // const fpsValue = getFpsValue(str?.r_frame_rate);
  // if (fpsValue != null) {
  //   await addIntMeta(file, MetaType.Fps, Math.round(fpsValue));
  // }

  const customVideoResults = await loadCustomVideoData(path, ffprobePath);

  if (customVideoResults != null) {
    // alternative creation date value
    if (typeof customVideoResults?.creationTime === 'object' && typeof str?.tags?.creation_time !== 'string') {
      await updateContentDate(file, customVideoResults.creationTime);
      await addDateMeta(file, MetaType.DateTime, customVideoResults.creationTime);
    }

    if (typeof customVideoResults?.model === 'string') {
      await addStringMeta(file, MetaType.Model, customVideoResults.model);
    }

    if (typeof customVideoResults?.manufacturer === 'string') {
      await addStringMeta(file, MetaType.Make, customVideoResults.manufacturer);
    }

    if (typeof customVideoResults?.location === 'object') {
      await addPositionMeta(
        file,
        MetaType.GpsCoordinates,
        customVideoResults.location.lat,
        customVideoResults.location.lon,
      );
    }

    if (typeof customVideoResults?.encoder === 'string') {
      await addStringMeta(file, MetaType.Encoder, customVideoResults.encoder);
    }

    if (typeof customVideoResults.fps === 'number') {
      await addFloatMeta(file, MetaType.Fps, customVideoResults.fps);
    }
  } else {
    const fpsValue = getFpsValue(str?.r_frame_rate);
    if (fpsValue != null) {
      await addIntMeta(file, MetaType.Fps, Math.round(fpsValue));
    }
  }

  // create thumbnail
  for (const size of thumbnailSizes) {
    const thumbnailFilePath = getFileThumbnailPath(file, size);
    await createThumbnailImage(path, thumbnailFilePath, size);

    console.log(`Thumbnail size ${size} saved to path ${thumbnailFilePath}`);
  }

  await updateThumbnailDate(file);

  return true;
};

/**
 *
 * @param fps string like '60/1'
 */
const getFpsValue = (fps: string | undefined): number | null => {
  if (typeof fps !== 'string') {
    return null;
  }

  const res = /(?<fps>\d+)\/\d+/.exec(fps);

  if (res?.groups == null) {
    return null;
  }

  return Number.parseInt(res.groups.fps);
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

const getKeyValueFromOutputResult = (input: string, key: string): string | null => {
  const rex = new RegExp(`${key}\\s*\\:\\s*(?<result>[^\\n]+)`, 'i');
  const m = rex.exec(input);
  if (m?.groups?.result !== undefined) {
    return m.groups.result.trim();
  }

  return null;
};

const loadCustomVideoData = async (path: string, customFfprobePath?: string): Promise<CustomVideoResult> => {
  const ret: CustomVideoResult = {};
  const executablePath = customFfprobePath ?? ffprobePath;

  const output = await mediaCommand(executablePath, ['-hide_banner', path]);

  [output].forEach((str) => {
    if (ret?.manufacturer == null) {
      const res = getKeyValueFromOutputResult(str, 'manufacturer');
      if (res != null) {
        ret.manufacturer = res;
      }
    }

    if (ret?.model == null) {
      const res = getKeyValueFromOutputResult(str, 'model');
      if (res != null) {
        ret.model = res;
      }
    }

    if (ret?.creationTime == null) {
      const res = getKeyValueFromOutputResult(str, 'creation_time');
      if (res != null) {
        ret.creationTime = getDateObject(res) ?? undefined;
      }
    }

    if (ret?.encoder == null) {
      const res = getKeyValueFromOutputResult(str, 'encoder');
      if (res != null) {
        ret.encoder = res;
      }
    }

    if (ret?.fps == null) {
      const result = /(?<fps>\d+(?:\.\d+))\s?fps/.exec(str);
      if (result !== null && typeof result?.groups?.fps === 'string') {
        ret.fps = Number.parseFloat(result.groups.fps);
      }
    }

    if (ret?.location == null) {
      // get location
      const m = str.match(/location\s*:\s*(?<lat>[+-][\d.]+)(?<lon>[+-][\d.]+)/i);
      if (m?.groups?.lat !== undefined && m?.groups?.lon !== undefined) {
        ret.location = {
          lat: Number.parseFloat(m.groups.lat),
          lon: Number.parseFloat(m.groups.lon),
        };
      }
    }
  });

  return ret;
};

const createThumbnailImage = async (videoFilePath: string, thumbnailPath: string, size: number): Promise<void> => {
  const executablePath = pathToFfmpeg;
  if (typeof executablePath !== 'string' || !existsSync(executablePath)) {
    throw new Error('FFmpeg executable not available');
  }

  const args = [
    '-y',
    '-threads',
    '1',
    '-i',
    videoFilePath,
    '-threads',
    '1',
    '-filter_threads',
    '1',
    '-frames:v',
    '1',
    '-vf',
    `scale=${Math.round(size)}:-1`,
    thumbnailPath,
  ];

  await mediaCommand(executablePath, args);
};

const supportedExtensions: string[] = ['mp4', 'mkv', 'avi', 'mpg', 'mpeg', 'mov'];

export const fillProcessorList = (processors: Record<string, FileProcessor>): void => {
  supportedExtensions.forEach((ext) => {
    processors[ext] = videoFileProcessor;
  });
};
