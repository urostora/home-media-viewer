import { AlbumResultType } from './albumTypes';
import { FileResultType } from './fileTypes';

export interface BrowseResult {
  relativePath: string;
  /** Current path is a directory stored as file object */
  storedDirectory: FileResultType | null;
  /** Current path is an album root directory */
  albumExactly: AlbumResultType | null;
  /** Current path is inside a stored album path */
  albumContains: AlbumResultType | null;
  /** Files and directories found in current path */
  content: Array<BrowseResultFile>;
}

export interface BrowseResultFile {
  /** name and extension */
  name: string;
  /** relative to album root */
  path: string;
  pathRelativeToAlbum: string | null;
  isDirectory: boolean;
  size: number;
  dateCreatedOn: string;
  dateModifiedOn: string;
  /** file object stored in database */
  storedFile: FileResultType | null;
  storedAlbum: AlbumResultType | null;
}