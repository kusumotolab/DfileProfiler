import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Drawer } from './drawer';
import { DockerParser } from './dockerParser';

export class FileDirMonitor {

    editor: vscode.TextEditor;
    changes: string[]; // 外部ファイル・ディレクトリの変更リスト
    initialStructure: string[]; // ビルド時点のディレクトリ構造
    initialFileContents: Map<string, string>; // ビルド時点の外部ファイルの内容

    constructor(editor: vscode.TextEditor) {
        this.editor = editor;
        this.changes = new Array();
        this.initialStructure = new Array();
        this.initialFileContents = new Map();
    }

    // 外部ファイル・ディレクトリの変更を検知するメソッド
    run(drawer: Drawer, dockerParser: DockerParser) {
        vscode.workspace.onDidChangeTextDocument(async event => {
            if (dockerParser.isNormalEnd) {
                // ファイルの内容が変更された場合
                const document = event.document;
                const newData = document.getText();
                const filePath = document.uri.fsPath;
                this.handleFileChange(filePath, newData);
                this.setFileDirChange(drawer, dockerParser);
            }
        });

        const watcher = vscode.workspace.createFileSystemWatcher('**/*');

        // 外部ファイル・ディレクトリが変更された場合
        // 新しいファイル・ディレクトリが作成された場合
        watcher.onDidCreate(async (uri: vscode.Uri) => {
            if (dockerParser.isNormalEnd) {
                if (this.initialStructure.includes(uri.fsPath)) {
                    // ビルド時点で存在した外部ファイル・ディレクトリを削除後に追加した場合、変更リストから削除
                    await this.deleteToChanges(uri.fsPath);
                } else {
                    // 変更リストに追加
                    await this.addToChanges(uri.fsPath, 'added');
                }
                this.setFileDirChange(drawer, dockerParser);
            }
        });

        // 外部ファイル・ディレクトリが削除された場合
        watcher.onDidDelete(async (uri: vscode.Uri) => {
            if (dockerParser.isNormalEnd) {
                if (this.initialStructure.includes(uri.fsPath)) {
                    // ビルド時点で存在した外部ファイル・ディレクトリを削除した場合、該当ファイル・ディレクトリを全て変更リストに追加
                    this.initialStructure.forEach(path => {
                        if (path.startsWith(uri.fsPath)) {
                            this.changes.push(`${uri.fsPath}|deleted`);
                        }
                    });
                } else {
                    // 変更リストから該当ファイル・ディレクトリを全て削除
                    this.changes = this.changes.filter(change => {
                        return !change.startsWith(uri.fsPath);
                    });
                }
                this.setFileDirChange(drawer, dockerParser);
            }
        });
    }

    // ファイル内容の変更を受けて変更リストに反映するメソッド
    handleFileChange(filePath: string, fileContent: string) {
        try {
            const newData = fileContent;
            const oldData = this.initialFileContents.get(filePath);

            if (oldData === undefined) {
                // 元ファイルが存在しなければ何もしない
                return;
            } else if (oldData !== newData) {
                // 元ファイルと一致していなければ変更リストに追加
                if (!this.changes.includes(`${filePath}|modified`)) {
                    this.changes.push(`${filePath}|modified`);
                }
            } else {
                // 元ファイルと一致していれば変更リストから削除
                const toRemove = [`${filePath}|added`, `${filePath}|deleted`, `${filePath}|modified`];
                this.changes = this.changes.filter(change => !toRemove.includes(change));
            }
        } catch (err) {
            // デバッグ用
            // console.error('Error reading file:', err);
        }
    }

    // 変更を検知した全ディレクトリ・ファイルを変更リストに追加するメソッド
    async addToChanges(basePath: string, operation: string) {
        const stats = await fs.stat(basePath);

        if (stats.isDirectory()) {
            // ディレクトリの場合、サブディレクトリやファイルを再帰的に追加
            this.changes.push(`${basePath}|${operation}`);
            const items = await fs.readdir(basePath);
            for (const item of items) {
                const fullPath = path.join(basePath, item);
                await this.addToChanges(fullPath, operation);
            }
        } else if (stats.isFile()) {
            // ファイルの場合、そのまま変更リストに追加
            this.changes.push(`${basePath}|${operation}`);
        }
    }


    // 変更を検知した全ディレクトリ・ファイルを変更リストから削除するメソッド
    async deleteToChanges(basePath: string) {
        const stats = await fs.stat(basePath);

        if (stats.isDirectory()) {
            const toRemove = [`${basePath}|added`, `${basePath}|deleted`, `${basePath}|modified`];
            this.changes = this.changes.filter(change => !toRemove.includes(change));
            const items = await fs.readdir(basePath);
            for (const item of items) {
                const fullPath = path.join(basePath, item);
                await this.deleteToChanges(fullPath);
            }
        } else if (stats.isFile()) {
            // ファイルの場合、内容が元ファイルと一致しているか確認
            const newData = await fs.readFile(basePath, 'utf8');
            this.handleFileChange(basePath, newData);
        }
    }

    // 外部ファイル・ディレクトリの変更をビューに反映するメソッド
    setFileDirChange(drawer: Drawer, dockerParser: DockerParser) {
        const changePaths: string[] = [];

        if (this.changes.length === 0) {
            drawer.changeCacheIcon(0, dockerParser.layerArray.length - 1, false); // 一度リセット
            if (drawer.dfileChangeLayeri < dockerParser.layerArray.length) {
                // Dfileの編集有無を反映
                drawer.changeCacheIcon(drawer.dfileChangeLayeri, dockerParser.layerArray.length - 1, true);
            }
            drawer.fileDirChangeLayeri = dockerParser.layerArray.length;
        } else {
            this.changes.forEach(async change => {
                const [changePath, changeType] = change.split('|');
                if (changeType === 'added' || changeType === 'deleted') {
                    changePaths.push(path.dirname(changePath));
                } else if (changeType === 'modified') {
                    changePaths.push(changePath);
                }
            });
            this.setFileDirtoLayer(changePaths, drawer, dockerParser);
        }
    }

    // 外部ファイル・ディレクトリの変更とキャッシュが効かなくなるレイヤをマッピングするメソッド
    setFileDirtoLayer(changePaths: string[], drawer: Drawer, dockerParser: DockerParser) {
        let minIndex = dockerParser.layerArray.length;

        changePaths.forEach(changePath => {
            for (let i = 0; i < dockerParser.layerArray.length; i++) {
                if (dockerParser.layerArray[i].fileDirArray.includes(changePath)) {
                    if (i < minIndex) {
                        minIndex = i;
                        break;
                    }
                }
            }
        });

        if (minIndex >= drawer.fileDirChangeLayeri) {
            let endLayerArrayIndex = 0;
            if (minIndex - 1 < drawer.dfileChangeLayeri) {
                endLayerArrayIndex = minIndex - 1;
            } else {
                endLayerArrayIndex = drawer.dfileChangeLayeri - 1;
            }
            drawer.changeCacheIcon(0, endLayerArrayIndex, false);
        }
        drawer.changeCacheIcon(minIndex, dockerParser.layerArray.length - 1, true);
        drawer.fileDirChangeLayeri = minIndex;
    }
    
}