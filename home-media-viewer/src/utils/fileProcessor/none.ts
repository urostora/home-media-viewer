import { File } from "@prisma/client";
import { FileProcessor } from "./processorFactory";


export const noneFileProcessor: FileProcessor = async (file: File) => true