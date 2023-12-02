import { MetadataProcessingStatus, Status, FileMetaType } from '@prisma/client';
import type { StatusSearchType, EntityWithStatusType, DateFilter, EntityType } from './generalTypes';

export interface FileSearchType extends StatusSearchType {
  album?: EntityType;
  parentFileId?: string | null;
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
  createdAt: Date;
  modifiedAt: Date;
  contentDate: Date | null;
  size: number | null;
  hash: string | null;
  metadataStatus: MetadataProcessingStatus;
  metadataProcessedAt: Date | null;
  metadataProcessingError: string | null;
  thumbnailStatus: MetadataProcessingStatus;
  thumbnailProcessedAt: Date | null;
  parentFileId: string | null;
  metas: FileMetadataType[];
  thumbnail: string | null;
}

export interface FileUpdateType extends EntityWithStatusType {}
