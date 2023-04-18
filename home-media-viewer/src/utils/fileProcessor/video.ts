import { Album, File } from '@prisma/client';
import { FileProcessor } from './processorFactory';
import { getFullPath, updateContentDate } from '../fileHelper';

import fs from 'fs';
import ffprobe from 'ffprobe';
import ffprobeStatic from 'ffprobe-static';
import { addDateMeta, addFloatMeta, addIntMeta, addStringMeta } from '../metaHelper';
import { getDateObject } from '../utils';
import { exec, execSync, spawn, spawnSync } from 'child_process';

const videoFileProcessor: FileProcessor = async (file: File, fileAlbum?: Album): Promise<boolean> => {
  const path = await getFullPath(file, fileAlbum);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  if (typeof ffprobeStatic?.path !== 'string') {
    throw new Error('FFMpeg path not available');
  }

  console.log('FFMpeg path', ffprobeStatic.path);
  console.log(`Getting video data from ${path}`);

  const videoData = await ffprobe(`${path}`, { path: ffprobeStatic.path });

  console.log('VideoData', videoData);

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
  if (typeof str?.tags?.creation_time === 'string') {
    const dateObj = getDateObject(str.tags.creation_time);

    if (dateObj != null) {
      await updateContentDate(file, dateObj);
      await addDateMeta(file, 'dateTime', dateObj);
    }
  }

  if (typeof str?.tags?.language === 'string') {
    await addStringMeta(file, 'language', str.tags.language);
  }
  if (typeof str?.codec_name === 'string') {
    await addStringMeta(file, 'codec', str.codec_name);
  }
  if (typeof str?.codec_long_name === 'string') {
    await addStringMeta(file, 'codec_full_name', str.codec_long_name);
  }
  if (typeof str?.width === 'number') {
    await addIntMeta(file, 'resolution_x', Math.round(str.width));
  }
  if (typeof str?.height === 'number') {
    await addIntMeta(file, 'resolution_y', Math.round(str.height));
  }

  if (typeof str?.duration === 'number') {
    await addFloatMeta(file, 'duration', str.duration);
  }
  if (typeof str?.bit_rate === 'number') {
    await addIntMeta(file, 'bitrate', Math.round(str.bit_rate));
  }

  const fpsValue = getFpsValue(str?.r_frame_rate);
  if (fpsValue != null) {
    await addIntMeta(file, 'fps', Math.round(fpsValue));
  }

  const customVideoResults = loadCustomVideoData(path, ffprobeStatic.path);
  console.log('Result', customVideoResults);

  // GPS related metas
  // if (typeof videoData?.  GPSLatitude?.description === 'number' && typeof tags?.GPSLongitude?.description === 'number') {
  //   await addPositionMeta(file, 'gps_coordinates', tags.GPSLatitude.description, tags.GPSLongitude.description);
  // }

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

  if (res == null || res.groups == null) {
    return null;
  }

  return Number.parseInt(res.groups.fps);
};

type CustomVideoResult = {
  model?: string;
  manufacturer?: string;
  location?: {
    lat: number;
    lon: number;
  };
  creationTime?: Date;
};

const getKeyValueFromOutputResult = (input: string, key: string): string | null => {
  const rex = new RegExp(`${key}\\s*\\:\\s*(?<result>[-_:\\w]+)`, 'i');
  console.log(rex);
  const m = rex.exec(input);
  if (m != null && m?.groups) {
    return m.groups['result'];
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

  console.log('Raw output', child.output);

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
      const m = str.match(/location\s*\:\s*(?<lat>[+-][\d\.]+)(?<lon>[+-][\d\.]+)/i);
      if (m != null && m?.groups) {
        ret.location = {
          lat: Number.parseFloat(m.groups['lat']),
          lon: Number.parseFloat(m.groups['lon']),
        };
      }
    }
  });

  return ret;
};

const supportedExtensions: string[] = ['mp4', 'mkv', 'avi', 'mpg', 'mpeg', 'mov'];

export const fillProcessorList = (processors: { [key: string]: FileProcessor }) => {
  supportedExtensions.forEach((ext) => {
    processors[ext] = videoFileProcessor;
  });
};
