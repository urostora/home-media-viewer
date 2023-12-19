export const getThumbnailUrl = (fileId: string, thumbnailSize: number = 200): string => {
  return `/api/file/thumbnail/${fileId}/${thumbnailSize}`;
};

export const getContentUrl = (fileId: string): string => {
  return `/api/file/content/${fileId}`;
};

export const isVideoByExtension = (extension: string): boolean => {
  return ['mp4', 'avi', 'mov', 'mkv', 'mpg', 'mpeg'].includes(extension.toLowerCase());
};

export const isImageByExtension = (extension: string): boolean => {
  return ['jpg', 'jpeg', 'gif', 'png'].includes(extension.toLowerCase());
};
