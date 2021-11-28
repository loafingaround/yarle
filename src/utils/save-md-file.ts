import { writeFile } from './file-utils';
import { getMdFilePath } from './folder-utils';
import { loggerInfo } from './loggerInfo';

export const saveMdFile = (data: any, note: any, notebookStackName: string) => {

    const absMdFilePath = getMdFilePath(note, notebookStackName);
    writeFile(absMdFilePath, data, note);
    loggerInfo(`Note saved to ${absMdFilePath}`);
};
