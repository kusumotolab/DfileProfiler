import * as vscode from 'vscode';
import * as fs from 'fs/promises'; // 非同期版の fs モジュール
import * as path from 'path';
import { Drawer } from './drawer';
import { DockerParser } from './dockerParser';

export class FileDirMonitor {
    // プロパティ
    editor : vscode.TextEditor;
    changes : string[];
    initialStructure : string[];
    initialFileContents: Map<string, string>;

    // コンストラクタ
    constructor(editor : vscode.TextEditor) {
        this.editor = editor;
        this.changes = new Array();
        this.initialStructure = new Array();
        this.initialFileContents = new Map();
    }

    run(drawer:Drawer, dockerParser:DockerParser){

        vscode.workspace.onDidChangeTextDocument(async event => {
            if(dockerParser.normalEndFlag){
                // ファイルの内容が変更されたとき
                const document = event.document;
                const newData = document.getText();
                const filePath = document.uri.fsPath;
                console.log("filePath = " + filePath);
                this.handleFileChange(filePath, newData);
                console.log("変更リスト : " + this.changes);
                this.setFileDirChange(drawer, dockerParser);
            }
        });
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        // ファイルやディレクトリが変更されたとき
        // 新しいファイルやディレクトリが作成されたとき
        watcher.onDidCreate(async (uri: vscode.Uri) => {
            if(dockerParser.normalEndFlag){
                console.log(`作成されたファイル/ディレクトリ: ${uri.fsPath}`);
                if(this.initialStructure.includes(uri.fsPath)){
                    // 初期状態で存在したファイルorディレクトリを(削除後に)追加した場合
                    // 変更リストから削除
                    await this.deleteToChanges(uri.fsPath);
                    console.log("変更リスト : " + this.changes);
                }else{
                // 変更リストに追加
                    await this.addToChanges(uri.fsPath, 'added');
                    console.log("変更リスト : " + this.changes);
                }
                this.setFileDirChange(drawer, dockerParser);
            }
        });
        // ファイルやディレクトリが削除されたとき
        watcher.onDidDelete(async (uri: vscode.Uri) => {
            if(dockerParser.normalEndFlag){
                console.log(`削除されたファイル/ディレクトリ: ${uri.fsPath}`);
                if(this.initialStructure.includes(uri.fsPath)){
                    // 初期状態で存在したファイルorディレクトリを削除した場合
                    // 該当のファイルorディレクトリ要素を全て変更リストに追加
                    this.initialStructure.forEach(path => {
                        if(path.startsWith(uri.fsPath)){
                            this.changes.push(`${uri.fsPath}|deleted`); 
                        }
                    });
                }else{
                    // 変更リストから該当のファイルorディレクトリ要素を全て削除
                    this.changes = this.changes.filter(change => {
                        return !change.startsWith(uri.fsPath);
                    });
                }
                console.log("変更リスト : " + this.changes);
                this.setFileDirChange(drawer, dockerParser);
            }
        });
    }

    handleFileChange(filePath: string, fileContent: string){
        try {
            const newData = fileContent;
            const oldData = this.initialFileContents.get(filePath);

            if (oldData === undefined) {
                // 元ファイルが存在しなければ何もしない
                return;
            } else if (oldData !== newData) {
                console.log(`File changed: ${filePath}`);
                // 元ファイルと一致していなければ変更リストに追加
                if(!this.changes.includes(`${filePath}|modified`)){
                    this.changes.push(`${filePath}|modified`);
                }
            } else {
                // 元ファイルと一致していれば変更リストから削除する
                console.log(`File reverted: ${filePath}`);
                const toRemove = [`${filePath}|added`, `${filePath}|deleted`, `${filePath}|modified`];
                this.changes = this.changes.filter(change => !toRemove.includes(change));
            }
        } catch (err) {
            console.error('Error reading file:', err);
        }
    }

    // 変更を検知した全ディレクトリorファイルを変更リストに追加する関数
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
            // ファイルの場合、リストに追加
            this.changes.push(`${basePath}|${operation}`);
        }
    }

    
    // 変更を検知した全ディレクトリorファイルを変更リストから削除する関数
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

    // ファイルorディレクトリの変更をビューに反映する関数
    setFileDirChange(drawer:Drawer, dockerParser:DockerParser){
        const changePaths: string[] = [];

        if (this.changes.length === 0) {
            // 全ての色を消した後
            // drawer.dfilei以降を塗る(ただしdrawer.dfileiはcomponentArrayの長さ未満でないといけない)
            // drawer.fileDiriをcomponentArrayの長さに更新
            drawer.changeRectangleColor(0, dockerParser.layerArray.length-1, false); // 一度リセット
            if(drawer.dfileChangeLayeri < dockerParser.layerArray.length){
                drawer.changeRectangleColor(drawer.dfileChangeLayeri, dockerParser.layerArray.length-1, true);
            }
            drawer.fileDirChangeLayeri = dockerParser.layerArray.length;
        } else {
            this.changes.forEach(async change => {
                const [changePath, changeType] = change.split('|');
                if (changeType === 'added' || changeType === 'deleted') {
                    changePaths.push(path.dirname(changePath));
                }else if (changeType === 'modified') {
                    changePaths.push(changePath);
                }
            });
            this.setFileDirtoLayer(changePaths, drawer, dockerParser);
        }
    }

    // ファイル・ディレクトリの変更とキャッシュが効かなくなるレイヤーを対応づける関数
    setFileDirtoLayer(changePaths:string[], drawer:Drawer, dockerParser:DockerParser){
        // changeArrayから1つ取り出し
        // さらにdockerParser.layerArrayから1つ取り出し
        // changeArrayの要素 ===fileDirならその該当レイヤーiを得る
        // jとi比べて、小さい方をjにセットしてcontinue（jの初期値はdockerParser.layerArray.length）
        // 上の2重ループ抜けた後、jで以下のiの処理をする

        let minIndex = dockerParser.layerArray.length;

        changePaths.forEach(changePath => {
            for(let i = 0; i < dockerParser.layerArray.length; i++){
                if(dockerParser.layerArray[i].fileDirArray.includes(changePath)){
                    if(i < minIndex){
                        minIndex = i;
                        console.log('該当レイヤーはインデックス ' + i + ' : dfilei = ' + drawer.dfileChangeLayeri + ' : fileDiri = ' + drawer.fileDirChangeLayeri);
                        break;
                    }
                }
            }
        });

        if(minIndex >= drawer.fileDirChangeLayeri){
            let endLayerArrayIndex = 0;
            if(minIndex-1 < drawer.dfileChangeLayeri){
                endLayerArrayIndex = minIndex-1;
            }else{
                endLayerArrayIndex = drawer.dfileChangeLayeri-1;
            }
            drawer.changeRectangleColor(0, endLayerArrayIndex, false);
        }
        drawer.changeRectangleColor(minIndex, dockerParser.layerArray.length-1, true);
        drawer.fileDirChangeLayeri = minIndex;
    }
}