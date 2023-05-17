export const getThumbnailUrl = (fileId: string, thumbnailSize: number = 200): string => {
  return `/api/file/thumbnail/${fileId}/${thumbnailSize}`;
};
