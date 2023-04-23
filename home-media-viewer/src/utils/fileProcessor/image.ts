import { Album, File, Prisma } from '@prisma/client';
import { FileProcessor } from './processorFactory';
import { getFullPath, updateContentDate, updateThumbnailDate } from '../fileHelper';

import fs from 'fs';
import * as ExifReader from 'exifreader';
import { addDateMeta, addFloatMeta, addIntMeta, addPositionMeta, addStringMeta } from '../metaHelper';
import { getDateObject } from '../utils';
import { getFileThumbnailPath, thumbnailSizes } from '../thumbnailHelper';
import jimp from 'jimp';

const imageFileProcessor: FileProcessor = async (file: File, fileAlbum?: Album): Promise<boolean> => {
  const path = await getFullPath(file, fileAlbum);

  if (!fs.existsSync(path)) {
    throw new Error(`File not found at path ${path}`);
  }

  // read metadata
  const tags = await ExifReader.load(path);

  if (typeof tags !== 'object') {
    throw new Error(`Could not read image metadata at path ${path}`);
  }

  if (typeof tags?.DateTime?.description === 'string') {
    const dateObj = getDateObject(tags.DateTime.description);

    if (dateObj != null) {
      await updateContentDate(file, dateObj);
      await addDateMeta(file, 'dateTime', dateObj);
    }
  }

  if (typeof tags?.Orientation?.value === 'number') {
    await addIntMeta(file, 'orientation', Math.round(tags.Orientation.value));
  }
  if (typeof tags?.Model?.description === 'string') {
    await addStringMeta(file, 'model', tags.Model.description);
  }
  if (typeof tags?.Make?.description === 'string') {
    await addStringMeta(file, 'make', tags.Make.description);
  }
  if (typeof tags?.ImageWidth?.value === 'number') {
    await addIntMeta(file, 'resolution_x', Math.round(tags.ImageWidth.value));
  }
  if (typeof tags?.ImageLength?.value === 'number') {
    await addIntMeta(file, 'resolution_y', Math.round(tags.ImageLength.value));
  }

  // GPS related metas
  if (typeof tags?.GPSLatitude?.description === 'number' && typeof tags?.GPSLongitude?.description === 'number') {
    await addPositionMeta(file, 'gps_coordinates', tags.GPSLatitude.description, tags.GPSLongitude.description);
  }

  if (Array.isArray(tags?.GPSAltitude?.value) && typeof tags?.GPSAltitude?.value[0] === 'number') {
    await addFloatMeta(file, 'gps_altitude', tags.GPSAltitude.value[0]);
  }

  if (typeof tags?.GPSDateStamp?.description === 'string' && typeof tags?.GPSTimeStamp?.description === 'string') {
    const gpsDate = getDateObject(`${tags.GPSDateStamp.description} ${tags.GPSTimeStamp.description}`);

    if (gpsDate != null) {
      await addDateMeta(file, 'gps_date', gpsDate);
    }
  }
  if (typeof tags?.GPSAltitudeRef?.description === 'string') {
    await addStringMeta(file, 'gps_altitude_ref', tags.GPSAltitudeRef.description);
  }

  // create thumbnail
  thumbnailSizes.forEach(async (size) => {
    console.log(`Creating thumbnail (size: ${size})`);
    const thumbnailPath = getFileThumbnailPath(file, size);
    console.log(`  Save to path ${thumbnailPath}`);

    const image = await jimp.read(path);
    image.resize(size, size).quality(60).resize(size, size).write(thumbnailPath);
  });

  await updateThumbnailDate(file);

  return true;
};

const supportedExtensions: string[] = ['bmp', 'jpg', 'jpeg', 'gif', 'png', 'tiff'];

export const fillProcessorList = (processors: { [key: string]: FileProcessor }) => {
  supportedExtensions.forEach((ext) => {
    processors[ext] = imageFileProcessor;
  });
};
