import * as ExifReader from 'exifreader';
import fs from 'fs';
import jimp from 'jimp';

import { getFullPath, updateContentDate, updateThumbnailDate } from '../fileHelper';

import { addDateMeta, addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from '../metaHelper';
import { getDateObject } from '../utils';
import { getFileThumbnailPath } from '../thumbnailHelper';

import type { File } from '@prisma/client';
import type { FileProcessor } from './processorFactory';
import { MetaType } from '../metaUtils';
import { thumbnailSizes } from '../frontend/thumbnailUtils';

const imageFileProcessor: FileProcessor = async (file: File): Promise<boolean> => {
  const path = getFullPath(file);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  // read metadata
  const tags = await ExifReader.load(path);

  if (typeof tags !== 'object') {
    throw new Error(`Could not read image metadata at path ${path}`);
  }

  // console.log(tags);

  let width: number | null = null;
  let height: number | null = null;
  let contentDate: Date | null = null;

  if (typeof tags?.DateTime?.description === 'string') {
    const dateObj = getDateObject(tags.DateTime.description);
    if (dateObj != null) {
      contentDate = dateObj;
    }
  }
  if (contentDate == null && typeof tags?.DateTimeOriginal?.description === 'string') {
    const dateObj = getDateObject(tags.DateTimeOriginal.description);
    if (dateObj != null) {
      contentDate = dateObj;
    }
  }
  if (contentDate == null) {
    // extract date from file name
    const dateFromFilename = getDateObject(file.name);
    if (dateFromFilename !== null && dateFromFilename.getFullYear() > 1990 && dateFromFilename.getFullYear() < 2040) {
      contentDate = dateFromFilename;
    }
  }

  if (contentDate != null) {
    await updateContentDate(file, contentDate);
    await addDateMeta(file, MetaType.DateTime, contentDate);
  }

  if (typeof tags?.Orientation?.value === 'number') {
    await addIntMeta(file, MetaType.Orientation, Math.round(tags.Orientation.value));
  }
  if (typeof tags?.Model?.description === 'string') {
    await addStringMeta(file, MetaType.Model, tags.Model.description);
  }
  if (typeof tags?.Make?.description === 'string') {
    await addStringMeta(file, MetaType.Make, tags.Make.description);
  }

  if (typeof tags?.ImageWidth?.value === 'number') {
    width = Math.round(tags.ImageWidth.value);
  } else if (typeof tags['Image Width']?.value === 'number') {
    width = Math.round(tags['Image Width']?.value);
  }

  if (width != null) {
    await addIntMeta(file, MetaType.ResolutionX, width);
  }

  if (typeof tags?.ImageLength?.value === 'number') {
    height = Math.round(tags.ImageLength.value);
  } else if (typeof tags['Image Height']?.value === 'number') {
    height = Math.round(tags['Image Height']?.value);
  }

  if (height != null) {
    await addIntMeta(file, MetaType.ResolutionY, height);
  }

  // GPS related metas
  if (typeof tags?.GPSLatitude?.description === 'number' && typeof tags?.GPSLongitude?.description === 'number') {
    await addPositionMeta(file, MetaType.GpsCoordinates, tags.GPSLatitude.description, tags.GPSLongitude.description);
  }

  if (Array.isArray(tags?.GPSAltitude?.value) && typeof tags?.GPSAltitude?.value[0] === 'number') {
    await addFloatMeta(file, MetaType.GpsAltitude, tags.GPSAltitude.value[0]);
  }

  if (typeof tags?.GPSDateStamp?.description === 'string' && typeof tags?.GPSTimeStamp?.description === 'string') {
    const gpsDate = getDateObject(`${tags.GPSDateStamp.description} ${tags.GPSTimeStamp.description}`);

    if (gpsDate != null) {
      await addDateMeta(file, MetaType.GpsDate, gpsDate);
    }
  }
  if (typeof tags?.GPSAltitudeRef?.description === 'string') {
    await addStringMeta(file, MetaType.GpsAltitudeRef, tags.GPSAltitudeRef.description);
  }

  if (width !== null && height !== null) {
    // create thumbnail
    for (const size of thumbnailSizes) {
      const thumbnailPath = getFileThumbnailPath(file, size);

      const image = await jimp.read(path);
      image
        .scaleToFit(size, size)
        .quality(size < 400 ? 50 : 75)
        .write(thumbnailPath);
      console.log(`  Thumbnail size ${size} saved to path ${thumbnailPath}`);
    }

    await updateThumbnailDate(file);
  }

  return true;
};

const supportedExtensions: string[] = ['bmp', 'jpg', 'jpeg', 'gif', 'png', 'tiff'];

export const fillProcessorList = (processors: Record<string, FileProcessor>): void => {
  supportedExtensions.forEach((ext) => {
    processors[ext] = imageFileProcessor;
  });
};
