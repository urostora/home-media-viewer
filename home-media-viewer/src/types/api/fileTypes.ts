import { type MetadataProcessingStatus, type Status, type FileMetaType } from '@prisma/client';
import type { StatusSearchType, EntityWithStatusType, DateFilter, EntityType, LocationFilter } from './generalTypes';

export interface FileSearchType extends StatusSearchType {
  album?: EntityType;
  parentFileId?: string | null;
  parentFilePath?: string;
  name?: string;
  contentType?: string;
  extension?: string;
  pathBeginsWith?: string;
  pathIsExactly?: string;
  fileDate?: DateFilter;
  contentDate?: DateFilter;
  metadataStatus?: MetadataProcessingStatus;
  isDirectory?: boolean;
  user?: string;
  location?: LocationFilter;
}

export interface FileMetadataType {
  type: FileMetaType;
  metaKey: string;
  stringValue: string | null;
  intValue: number | null;
  floatValue: number | null;
  dateValue: Date | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FileResultType {
  id: string;
  status: Status;
  path: string;
  name: string;
  extension: string;
  isDirectory: boolean;
  createdAt: string;
  modifiedAt: string;
  contentDate: string | null;
  size: number | null;
  hash: string | null;
  metadataStatus: MetadataProcessingStatus;
  metadataProcessedAt: string | null;
  metadataProcessingError: string | null;
  thumbnailStatus: MetadataProcessingStatus;
  thumbnailProcessedAt: Date | null;
  parentFileId: string | null;
  metas: FileMetadataType[];
  thumbnail: string | null;
}

export interface FileUpdateType extends EntityWithStatusType {}
