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
