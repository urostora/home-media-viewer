import * as ExifReader from 'exifreader';
import fs from 'fs';
import jimp from 'jimp';

import { getFullPath } from '../fileHelper';

import { MetadataCollector, type ExtractedMetadata } from './metadata';
import { getDateObject } from '../utils';

import type { File } from '@prisma/client';
import { MetaType } from '../metaUtils';
import { thumbnailSizes } from '../frontend/thumbnailUtils';

export const extractImageMetadata = async (file: File): Promise<ExtractedMetadata> => {
  const metadata = new MetadataCollector();
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
    metadata.contentDate = contentDate;
    metadata.addDate(MetaType.DateTime, contentDate);
  }

  if (typeof tags?.Orientation?.value === 'number') {
    metadata.addInt(MetaType.Orientation, Math.round(tags.Orientation.value));
  }
  if (typeof tags?.Model?.description === 'string') {
    metadata.addString(MetaType.Model, tags.Model.description);
  }
  if (typeof tags?.Make?.description === 'string') {
    metadata.addString(MetaType.Make, tags.Make.description);
  }

  if (typeof tags?.ImageWidth?.value === 'number') {
    width = Math.round(tags.ImageWidth.value);
  } else if (typeof tags['Image Width']?.value === 'number') {
    width = Math.round(tags['Image Width']?.value);
  }

  if (width != null) {
    metadata.addInt(MetaType.ResolutionX, width);
  }

  if (typeof tags?.ImageLength?.value === 'number') {
    height = Math.round(tags.ImageLength.value);
  } else if (typeof tags['Image Height']?.value === 'number') {
    height = Math.round(tags['Image Height']?.value);
  }

  if (height != null) {
    metadata.addInt(MetaType.ResolutionY, height);
  }

  // GPS related metas
  if (typeof tags?.GPSLatitude?.description === 'number' && typeof tags?.GPSLongitude?.description === 'number') {
    metadata.addPosition(MetaType.GpsCoordinates, tags.GPSLatitude.description, tags.GPSLongitude.description);
  }

  if (Array.isArray(tags?.GPSAltitude?.value) && typeof tags?.GPSAltitude?.value[0] === 'number') {
    metadata.addFloat(MetaType.GpsAltitude, tags.GPSAltitude.value[0]);
  }

  if (typeof tags?.GPSDateStamp?.description === 'string' && typeof tags?.GPSTimeStamp?.description === 'string') {
    const gpsDate = getDateObject(`${tags.GPSDateStamp.description} ${tags.GPSTimeStamp.description}`);

    if (gpsDate != null) {
      metadata.addDate(MetaType.GpsDate, gpsDate);
    }
  }
  if (typeof tags?.GPSAltitudeRef?.description === 'string') {
    metadata.addString(MetaType.GpsAltitudeRef, tags.GPSAltitudeRef.description);
  }

  return metadata;
};

export const generateImageThumbnails = async (file: File, outputs: ReadonlyMap<number, string>): Promise<void> => {
  const path = getFullPath(file);
  for (const size of thumbnailSizes) {
    const output = outputs.get(size);
    if (output === undefined) throw new Error('Missing thumbnail output');
    const image = await jimp.read(path);
    await image
      .scaleToFit(size, size)
      .quality(size < 400 ? 50 : 75)
      .writeAsync(output);
  }
};
