export interface TestFile {
  name: string;
  extension: string;
  isDirectory: boolean;
  files?: TestFile[];

  parentFile?: TestFile | null;
  fullPath?: string;
}

export const getTestFilesInPath = (path: string, flattened: boolean = false): TestFile[] => {
  if (path === '' || path === '/') {
    // return root files
    return testfiles;
  }

  const pathParts = path.split('/');

  let currentPathFiles: TestFile[] = getHydratedTestFiles();

  for (const part of pathParts) {
    const partFile = currentPathFiles.find((f) => f.name === part && f.isDirectory);
    if (partFile === null || !Array.isArray(partFile?.files)) {
      throw Error(`Could not get test files from path ${path}`);
    }

    currentPathFiles = partFile?.files;
  }

  return flattened ? getAllChildrenFlattened(currentPathFiles) : currentPathFiles;
};

export const getAllChildrenFlattened = (directoryFiles: TestFile[]): TestFile[] => {
  const ret: TestFile[] = [];

  for (const file of directoryFiles) {
    ret.push(file);

    if (file.isDirectory && Array.isArray(file.files)) {
      ret.push(...getAllChildrenFlattened(file.files));
    }
  }

  return ret;
};

const connectTestFiles = (files: TestFile[], parentFile: TestFile | null, parentPath: string): void => {
  for (const file of files) {
    file.parentFile = parentFile;
    file.fullPath = `${parentPath}/${file.name}${file.extension.length > 0 ? `.${file.extension}` : ''}`;

    if (Array.isArray(file.files)) {
      connectTestFiles(file.files, file, file.fullPath);
    }
  }
};

const getHydratedTestFiles = (): TestFile[] => {
  // add parent references and full path
  if (!areTestFilesConnected) {
    connectTestFiles(testfiles, null, '');
    areTestFilesConnected = true;
  }

  return testfiles;
};

let areTestFilesConnected = false;

export const testfiles: TestFile[] = [
  {
    name: 'album01',
    extension: '',
    isDirectory: true,
    files: [
      {
        name: 'album01dir01',
        extension: '',
        isDirectory: true,
        files: [
          {
            name: 'album01dir01dir01',
            extension: '',
            isDirectory: true,
            files: [
              {
                name: 'IMG_20220709_124523',
                extension: 'jpg',
                isDirectory: false,
              },
            ],
          },
          {
            name: 'IMG_20220709_111415',
            extension: 'jpg',
            isDirectory: false,
          },
        ],
      },
      {
        name: 'album01dir02',
        extension: '',
        isDirectory: true,
        files: [
          {
            name: 'IMG_20220710_110856',
            extension: 'jpg',
            isDirectory: false,
          },
        ],
      },
      {
        name: 'IMG_20210703_085531',
        extension: 'jpg',
        isDirectory: false,
      },
      {
        name: 'IMG_20220709_105212',
        extension: 'jpg',
        isDirectory: false,
      },
      {
        name: 'Vid 20180731 180643.mp4',
        extension: 'mp4',
        isDirectory: false,
      },
    ],
  },
  {
    name: 'album02',
    extension: '',
    isDirectory: true,
    files: [
      {
        name: 'IMG_20180624_105421',
        extension: 'jpg',
        isDirectory: false,
      },
      {
        name: 'Vid 20180501 163728',
        extension: 'mp4',
        isDirectory: false,
      },
    ],
  },
  {
    name: 'albumHierarchy',
    extension: '',
    isDirectory: true,
    files: [
      {
        name: 'depth01',
        extension: '',
        isDirectory: true,
        files: [
          {
            name: 'depth02',
            extension: '',
            isDirectory: true,
            files: [
              {
                name: 'depth03',
                extension: '',
                isDirectory: true,
                files: [
                  {
                    name: 'depth04',
                    extension: '',
                    isDirectory: true,
                    files: [
                      {
                        name: 'IMG_20230820_211228',
                        extension: 'jpg',
                        isDirectory: false,
                      },
                      {
                        name: 'IMG_20230820_211248',
                        extension: 'jpg',
                        isDirectory: false,
                      },
                      {
                        name: 'IMG_20230820_211910',
                        extension: 'jpg',
                        isDirectory: false,
                      },
                    ],
                  },
                  {
                    name: 'IMG_20230726_140934',
                    extension: 'jpg',
                    isDirectory: false,
                  },
                  {
                    name: 'IMG_20230820_201246',
                    extension: 'jpg',
                    isDirectory: false,
                  },
                ],
              },
              {
                name: 'IMG_20230627_121541',
                extension: 'jpg',
                isDirectory: false,
              },
              {
                name: 'IMG_20230726_135530',
                extension: 'jpg',
                isDirectory: false,
              },
            ],
          },
          {
            name: 'IMG_20221228_111533',
            extension: 'jpg',
            isDirectory: false,
          },
          {
            name: 'IMG_20230627_112221',
            extension: 'jpg',
            isDirectory: false,
          },
        ],
      },
    ],
  },
  {
    name: 'testalbum01',
    extension: '',
    isDirectory: true,
    files: [
      {
        name: 'testalbum0101',
        extension: '',
        isDirectory: true,
        files: [
          {
            name: 'testalbum010101',
            extension: '',
            isDirectory: true,
            files: [
              {
                name: 'IMG_20221228_111554',
                extension: 'jpg',
                isDirectory: false,
              },
            ],
          },
          {
            name: 'IMG_20230820_201246',
            extension: 'jpg',
            isDirectory: false,
          },
        ],
      },
      {
        name: 'IMG_20230820_211910',
        extension: 'jpg',
        isDirectory: false,
      },
    ],
  },
  {
    name: 'testalbum02',
    extension: '',
    isDirectory: true,
    files: [
      {
        name: 'IMG_20230820_211230',
        extension: 'jpg',
        isDirectory: false,
      },
    ],
  },
];
