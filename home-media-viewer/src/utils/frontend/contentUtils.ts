export const getThumbnailUrl = (fileId: string, thumbnailSize: number = 200): string => {
  return `/api/file/thumbnail/${fileId}/${thumbnailSize}`;
};

export const getContentUrl = (fileId: string) => {
  return `/api/file/content/${fileId}`;
};
