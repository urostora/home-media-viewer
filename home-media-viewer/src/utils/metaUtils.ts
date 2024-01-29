import type { FileMetadataType } from '@/types/api/fileTypes';

export const MetaType = {
  DateTime: 'dateTime',
  Orientation: 'orientation',
  Model: 'model',
  Make: 'make',
  ResolutionX: 'resolution_x',
  ResolutionY: 'resolution_y',
  GpsCoordinates: 'gps_coordinates',
  GpsAltitude: 'gps_altitude',
  GpsDate: 'gps_date',
  GpsAltitudeRef: 'gps_altitude_ref',
  Language: 'language',
  Codec: 'codec',
  CodecFullName: 'codec_full_name',
  Encoder: 'encoder',
  Duration: 'duration',
  Bitrate: 'bitrate',
  Fps: 'fps',
};

interface DetailedMetaData {
  key: string;
  type: 'Int' | 'Float' | 'String' | 'DateTime' | 'Location';
  label: string;
  unit?: string;
}

export const MetaDetails: Record<string, DetailedMetaData> = {
  dateTime: {
    key: 'dateTime',
    type: 'DateTime',
    label: 'Content date',
  },
  orientation: {
    key: 'orientation',
    type: 'Int',
    label: 'Orientation',
  },
  model: {
    key: 'model',
    type: 'String',
    label: 'Model',
  },
  make: {
    key: 'make',
    type: 'String',
    label: 'Make',
  },
  resolution_x: {
    key: 'resolution_x',
    type: 'Int',
    label: 'Resolution X',
  },
  resolution_y: {
    key: 'resolution_y',
    type: 'Int',
    label: 'Resolution Y',
  },
  gps_coordinates: {
    key: 'gps_coordinates',
    type: 'Location',
    label: 'Location',
  },
  gps_altitude: {
    key: 'gps_altitude',
    type: 'Float',
    label: 'Altitude',
  },
  gps_altitude_ref: {
    key: 'gps_altitude_ref',
    type: 'String',
    label: 'GPS altitude reference',
  },
  gps_date: {
    key: 'gps_date',
    type: 'DateTime',
    label: 'GPS date',
  },
  language: {
    key: 'language',
    type: 'String',
    label: 'Language',
  },
  codec: {
    key: 'codec',
    type: 'String',
    label: 'Codec',
  },
  codec_full_name: {
    key: 'codec_full_name',
    type: 'String',
    label: 'Codec full name',
  },
  encoder: {
    key: 'encoder',
    type: 'String',
    label: 'Encoder',
  },
  duration: {
    key: 'duration',
    type: 'Float',
    label: 'Duration',
  },
  bitrate: {
    key: 'bitrate',
    type: 'Int',
    label: 'Bitrate',
  },
  fps: {
    key: 'fps',
    type: 'Float',
    label: 'FPS',
    unit: 'fps',
  },
};

export const getMetaTitle = (metadata: FileMetadataType): string | null => {
  const details = MetaDetails[metadata.metaKey] ?? null;

  if (details !== null) {
    return details.label;
  }

  return null;
};

export const getMetaStringValue = (metadata: FileMetadataType): string | null => {
  const details = MetaDetails[metadata.metaKey] ?? null;

  let value: string | null = null;
  switch (metadata.type) {
    case 'String':
      value = metadata.stringValue ?? null;
      break;
    case 'Int':
      value = metadata.intValue === null ? null : `${metadata.intValue}`;
      break;
    case 'Float':
      value = metadata.floatValue === null ? null : `${metadata.floatValue?.toFixed(2)}`;
      break;
    case 'DateTime':
      value = metadata.dateValue === null ? null : `${metadata?.dateValue}`;
      break;
    case 'Location':
      value =
        metadata.latitude === null || metadata.longitude === null
          ? null
          : `${metadata.latitude?.toFixed(5)} ${metadata.longitude?.toFixed(5)}`;
      break;
  }

  if (details !== null) {
    if (typeof details.unit === 'string') {
      value += details.unit;
    }
  }

  return value;
};

export const durationInSecToString = (duration: number = 0, hideZeroParts: boolean = false): string => {
  let ret = '';

  if (duration / (60 * 60) >= 1) {
    const hours = Math.floor(duration / (60 * 60));
    ret += ` ${hours}h`;
    duration -= hours * (60 * 60);
  }

  if (duration / 60 >= 1) {
    const minutes = Math.floor(duration / 60);
    ret += ` ${minutes}m`;
    duration -= minutes * 60;
  }

  if (duration > 0) {
    const seconds = Math.floor(duration);
    ret += ` ${seconds}s`;
  }

  return ret.trim();
};

export const contentSizeToString = (size: number): string => {
  if (size > 2 ** 20 * 10) {
    // display megabytes
    const megabytes = Math.floor(size / 2 ** 20);
    return `${megabytes}MB`;
  }

  if (size > 2 ** 10 * 10) {
    // display megabytes
    const megabytes = Math.floor(size / 2 ** 10);
    return `${megabytes}kB`;
  }

  return `${Math.floor(size)}B`;
};
