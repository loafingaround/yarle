// tslint:disable:no-console
import fs, { Dirent } from 'fs';
import { merge } from 'lodash';
import * as path from 'path';
import flow from 'xml-flow';

import * as utils from './utils';
import { YarleOptions } from './YarleOptions';
import { processNode } from './process-node';
import { isWebClip } from './utils/note-utils';
import { loggerInfo } from './utils/loggerInfo';
import { hasCreationTimeInTemplate,
  hasLinkToOriginalInTemplate,
  hasLocationInTemplate,
  hasNotebookInTemplate,
  hasSourceURLInTemplate,
  hasTagsInTemplate,
  hasUpdateTimeInTemplate } from './utils/templates/checker-functions';
import { defaultTemplate } from './utils/templates/default-template';
import { OutputFormat } from './output-format';
import { clearLogFile } from './utils/clearLogFile';

export const defaultYarleOptions: YarleOptions = {
  enexSources: ['notebook.enex'],
  outputDir: './mdNotes',
  keepOriginalHtml: false,
  isMetadataNeeded: false,
  isNotebookNameNeeded: false,
  isZettelkastenNeeded: false,
  plainTextNotesOnly: false,
  skipWebClips: false,
  useHashTags: true,
  nestedTags: {
    separatorInEN: '_',
    replaceSeparatorWith: '/',
    replaceSpaceWith: '-',
  },
  outputFormat: OutputFormat.StandardMD,
  urlEncodeFileNamesAndLinks: false,
  pathSeparator: '/',
  resourcesDir: '_resources',
  turndownOptions: {
    headingStyle: 'atx',
  },
};

interface EnexSource {
  path: string
  notebookStackName: string
}

export let yarleOptions: YarleOptions = { ...defaultYarleOptions };

const setOptions = (options: YarleOptions): void => {
  yarleOptions = merge({}, defaultYarleOptions, options);

  let template = (yarleOptions.templateFile)  ?  fs.readFileSync(yarleOptions.templateFile, 'utf-8') : defaultTemplate;
  template = yarleOptions.currentTemplate ? yarleOptions.currentTemplate : template;

  /*if (yarleOptions.templateFile) {*/
  // todo: handle file not exists error
  yarleOptions.skipCreationTime = !hasCreationTimeInTemplate(template);
  yarleOptions.skipLocation = !hasLocationInTemplate(template);
  yarleOptions.skipSourceUrl = !hasSourceURLInTemplate(template);
  yarleOptions.skipTags = !hasTagsInTemplate(template);
  yarleOptions.skipUpdateTime = !hasUpdateTimeInTemplate(template);
  yarleOptions.isNotebookNameNeeded = hasNotebookInTemplate(template);
  yarleOptions.keepOriginalHtml = hasLinkToOriginalInTemplate(template);

  yarleOptions.currentTemplate = template;

  loggerInfo(`Current config is: ${JSON.stringify(yarleOptions, null, 4)}`);
  loggerInfo(`Path separator:${path.sep}`);
  /*}*/
};

export const parseStream = async (options: YarleOptions, enexSource: string, notebookStackName: string): Promise<void> => {
  loggerInfo(`Getting stream from ${enexSource}`);
  const stream = fs.createReadStream(enexSource);
  // const xml = new XmlStream(stream);
  let noteNumber = 0;
  let failed = 0;
  let skipped = 0;

  const notebookName = utils.getNotebookName(enexSource);

  return new Promise((resolve, reject) => {

    const logAndReject = (error: Error) => {
      loggerInfo(`Could not convert ${enexSource}:\n${error.message}`);
      ++failed;

      return reject();
    };
    if (!fs.existsSync(enexSource)) {
      return loggerInfo(JSON.stringify({ name: 'NoSuchFileOrDirectory', message: 'source Enex file does not exist' }));
    }

    const xml = flow(stream);

    let noteAttributes: any = null;
    xml.on('tag:note-attributes', (na: any) => {
      noteAttributes = na;
    });

    xml.on('tag:note', (note: any) => {
      if (options.skipWebClips && isWebClip(note)) {
        ++skipped;
        loggerInfo(`Notes skipped: ${skipped}`);
      } else {
        if (noteAttributes) {
          // make sure single attributes are not collapsed
          note['note-attributes'] = noteAttributes;
        }
        processNode(note, notebookName, notebookStackName);
        ++noteNumber;
        loggerInfo(`Notes processed: ${noteNumber}\n\n`);
      }
      noteAttributes = null;
    });

    xml.on('end', () => {
      const success = noteNumber - failed;
      const totalNotes = noteNumber + skipped;
      loggerInfo('==========================');
      loggerInfo(
        `Conversion finished: ${success} succeeded, ${skipped} skipped, ${failed} failed. Total notes: ${totalNotes}`,
      );

      return resolve();
    });
    xml.on('error', logAndReject);
    stream.on('error', logAndReject);
  });
};

export const dropTheRope = async (options: YarleOptions): Promise<void> => {
  let enexSources: EnexSource[];

  if (options.enexSources.length === 1 && options.enexSources[0].endsWith('.enex')) {
    loggerInfo(`Converting notes in file: ${options.enexSources}`);
    enexSources = options.enexSources.map(enexFile => ({
      "path": enexFile,
      "notebookStackName": ""
    }));
  } else {
    // TODO: add info log here (as above for single file)?
    const baseDir = options.enexSources[0];
    const enexEntries = fs.readdirSync(baseDir, {"withFileTypes": true});
    let isEnexFile = ((entry: Dirent) => entry.isFile() && entry.name.match(/.*\.enex/ig));
    enexSources = enexEntries
      .filter(isEnexFile)
      .map(enexFile => ({
        "path": `${baseDir}/${enexFile.name}`,
        "notebookStackName": ""
      }))
      .concat(...enexEntries
        .filter(entry => entry.isDirectory())
        .map(dir => fs.readdirSync(`${baseDir}/${dir.name}`, {"withFileTypes": true})
          .filter(isEnexFile)
          .map(enexFile => ({
            "path": `${baseDir}/${dir.name}/${enexFile.name}`,
            "notebookStackName": dir.name
      }))));
  }

  clearLogFile();
  setOptions(options);
  for (const enex of enexSources) {
    utils.setPaths(enex.path);
    await parseStream(options, enex.path, enex.notebookStackName);
  }

};
// tslint:enable:no-console
