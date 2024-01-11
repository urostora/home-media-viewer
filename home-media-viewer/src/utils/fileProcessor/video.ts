import fs, { existsSync } from 'fs';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import pathToFfmpeg from 'ffmpeg-static';

import { getFullPath, updateContentDate, updateThumbnailDate } from '../fileHelper';
import { addDateMeta, addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from '../metaHelper';
import { getDateObject } from '../utils';
import { spawnSync } from 'child_process';
import { getFileThumbnailPath, thumbnailSizes } from '../thumbnailHelper';

import { type File } from '@prisma/client';
import { type FileProcessor } from './processorFactory';
import { MetaType } from '../metaUtils';

const videoFileProcessor: FileProcessor = async (file: File): Promise<boolean> => {
  const path = getFullPath(file);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  if (typeof ffprobeStatic?.path !== 'string') {
    throw new Error('FFMpeg path not available');
  }

  const videoData = await ffprobe(`${path}`, { path: ffprobeStatic.path });

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

  const fpsValue = getFpsValue(str?.r_frame_rate);
  if (fpsValue != null) {
    await addIntMeta(file, MetaType.Fps, Math.round(fpsValue));
  }

  const customVideoResults = loadCustomVideoData(path, ffprobeStatic.path);

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
  }

  // create thumbnail
  thumbnailSizes.forEach((size) => {
    const thumbnailFilePath = getFileThumbnailPath(file, size);
    createThumbnailImage(path, thumbnailFilePath, size);

    console.log(`Thumbnail size ${size} saved to path ${thumbnailFilePath}`);
  });

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
}

const getKeyValueFromOutputResult = (input: string, key: string): string | null => {
  const rex = new RegExp(`${key}\\s*\\:\\s*(?<result>[-_:\\w]+)`, 'i');
  const m = rex.exec(input);
  if (m?.groups?.result !== undefined) {
    return m.groups.result;
  }

  return null;
};

const loadCustomVideoData = (path: string, ffprobePath?: string): CustomVideoResult => {
  const ret: CustomVideoResult = {};
  const executablePath = ffprobePath ?? ffprobeStatic.path;

  const child = spawnSync(executablePath, [path], { encoding: 'utf-8' });

  if (!Array.isArray(child?.output)) {
    return ret;
  }

  child.output.forEach((str) => {
    if (typeof str !== 'string') {
      return;
    }

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

const createThumbnailImage = (videoFilePath: string, thumbnailPath: string, size: number): void => {
  const executablePath = pathToFfmpeg;
  if (typeof executablePath !== 'string' || !existsSync(executablePath)) {
    return;
  }

  const args = ['-i', videoFilePath, '-frames:v', '1', '-vf', `scale=${Math.round(size)}:-1`, thumbnailPath];

  spawnSync(executablePath, args);
};

const supportedExtensions: string[] = ['mp4', 'mkv', 'avi', 'mpg', 'mpeg', 'mov'];

export const fillProcessorList = (processors: Record<string, FileProcessor>): void => {
  supportedExtensions.forEach((ext) => {
    processors[ext] = videoFileProcessor;
  });
};
