import { readdir, readFileSync } from 'fs-extra';
import { BuildHook, IBuildResult, ITaskOptions } from '../@types';
import { PACKAGE_NAME } from './global';
import { compress } from 'lzma';
import fs from 'fs';
import path from 'path';
import { packSingleHtml } from './packSingleHtml';


function log(...arg: any[]) {
    return console.log(`[${PACKAGE_NAME}] `, ...arg);
}

// let allAssets = [];

function readFilesSync(filePath: string): string[] {
    const files = fs.readdirSync(filePath, { withFileTypes: true, recursive: false });
    const filenames: string[] = [];
    for (const file of files) {
        const newFilePath = path.join(filePath, file.name);
        if (file.isFile())
            filenames.push(newFilePath);
        else if (file.isDirectory())
            filenames.push(...readFilesSync(newFilePath));
    }
    return filenames;
}

export const throwError: BuildHook.throwError = true;

export const load: BuildHook.load = async function () {
    console.log(`[${PACKAGE_NAME}] Load cocos plugin example in builder.`);
    // allAssets = await Editor.Message.request('asset-db', 'query-assets');
};

export const onBeforeBuild: BuildHook.onBeforeBuild = async function (options: ITaskOptions, result: IBuildResult) {
    // TODO some thing
    log(`${PACKAGE_NAME}.webTestOption`, 'onBeforeBuild');
};

export const onBeforeCompressSettings: BuildHook.onBeforeCompressSettings = async function (options: ITaskOptions, result: IBuildResult) {
    const pkgOptions = options.packages[PACKAGE_NAME];
    if (pkgOptions.webTestOption) {
        console.debug('webTestOption', true);
    }
    // Todo some thing
    console.debug('get settings test', result.settings);
};

export const onAfterCompressSettings: BuildHook.onAfterCompressSettings = async function (options: ITaskOptions, result: IBuildResult) {
    // Todo some thing
    console.log('webTestOption', 'onAfterCompressSettings');
};

export const onAfterBuild: BuildHook.onAfterBuild = async function (options: ITaskOptions, result: IBuildResult) {
    await packSingleHtml(result.dest);
    console.log(`${PACKAGE_NAME}_onAfterBuild`, result.dest);
};

export const unload: BuildHook.unload = async function () {
    console.log(`[${PACKAGE_NAME}] Unload cocos plugin example in builder.`);
};

export const onError: BuildHook.onError = async function (options, result) {
    // Todo some thing
    console.warn(`${PACKAGE_NAME} run onError`);
};

export const onBeforeMake: BuildHook.onBeforeMake = async function (root, options) {
    console.log(`onBeforeMake: root: ${root}, options: ${options}`);
};

export const onAfterMake: BuildHook.onAfterMake = async function (root, options) {
    console.log(`onAfterMake: root: ${root}, options: ${options}`);
};
