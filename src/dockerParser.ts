import * as vscode from 'vscode';
import { Layer } from './layer';
import { LayerView } from './layerView';
import { Drawer } from './drawer';
import { State } from './state';
import path from 'path';
import * as fs from 'fs';
import { DfileMonitor } from './dfileMonitor';
import { FileDirMonitor } from './fileDirMonitor';

const util = require('util');
const childProcess = require('child_process');
const exec = util.promisify(childProcess.exec);
const { spawn } = require('child_process');

export class DockerParser {

    editor: vscode.TextEditor;
    layerArray: any[];
    drawer: Drawer;
    dfileMonitor: DfileMonitor;
    fileDirMonitor: FileDirMonitor;
    stateArray: State[]; // ビルド結果の履歴
    normalEndFlag: boolean; // 解析処理が正常終了したか判定するフラグ

    constructor(editor: vscode.TextEditor, drawer: Drawer, dfileMonitor: DfileMonitor, fileDirMonitor: FileDirMonitor, stateArray: State[]) {
        this.editor = editor;
        this.layerArray = new Array();
        this.drawer = drawer;
        this.dfileMonitor = dfileMonitor;
        this.fileDirMonitor = fileDirMonitor;
        this.stateArray = stateArray;
        this.normalEndFlag = false;
    }

    // ビルド時の解析を行うメソッド
    run(layerView: LayerView) {
        if (this.dfileMonitor.dfileActiveFlag) {
            // Dfileの内容を取得
            const editorText = this.editor.document.getText();

            const dockerfilePath = this.editor?.document.uri.fsPath;
            if (!dockerfilePath) {
                vscode.window.showErrorMessage('File Open Error! : Please restart VSCode.');
            }
            const lastSeparatorIndex = Math.max(dockerfilePath.lastIndexOf('/'), dockerfilePath.lastIndexOf('\\'));
            const buildContext = dockerfilePath.substring(0, lastSeparatorIndex);

            // レイヤビューを更新
            layerView.header1 = 'Building......';
            layerView.loading = `var gif = document.getElementById('loading');
                                 gif.style.display = 'block'; // GIFを表示`;
            layerView.setHtml();

            let buildLog = '';

            // buildコマンドを実行
            let buildProcess = spawn('docker', ['build', '--progress=plain', '-t', 'myimage', '-f', dockerfilePath, buildContext]);

            // デバッグ用
            /* buildProcess.stdout.on('data', (data: any) => {
                console.log(data.toString());
            }); */

            // ビルド時の出力情報をWebviewに送信
            buildProcess.stderr.on('data', (data: any) => {
                layerView.webview.postMessage({ type: 'stderr', text: data.toString() });
                buildLog += data.toString();
            });

            // プロセスが終了したときの処理
            buildProcess.on('close', async (code: any) => {
                if (code === 0) {
                    // ビルドが成功した場合にログをクリアするメッセージを送信
                    layerView.webview.postMessage({ type: 'clear' });

                    layerView.header1 = 'Drawing......';
                    layerView.setHtml();

                    // historyコマンドを実行
                    let historyRes = await exec(`docker history --human=false myimage`, { maxBuffer: 50 * 1024 * 1024 });

                    // <none>イメージを一括削除する
                    exec(`docker image prune -f`);

                    //レイヤ情報を作成
                    this.splitHistoryInfo(historyRes.stdout);
                    this.splitBuildInfo(buildLog);
                    this.addFileDirInfo(buildContext);

                    // 過去のビルドコメントを全て取得
                    // 上限に達している場合は一番古いビルド結果を削除しておく
                    if (this.stateArray.length > 5) { // 保持しておく過去のビルド結果数は5まで
                        this.stateArray.shift();
                    }
                    layerView.radioCnt = this.stateArray.length;
                    this.setCommentArray(layerView);

                    // レイヤビューに描画
                    this.drawer.run(editorText, this.layerArray);

                    this.drawer.dfileChangeLayeri = this.layerArray.length;
                    this.drawer.fileDirChangeLayeri = this.layerArray.length;

                    // ビルド時の描画状態を保存する
                    this.stateArray.push(new State(layerView));
                    this.normalEndFlag = true;
                } else {
                    // ビルドが失敗した場合
                    layerView.webview.postMessage({ type: 'close' });
                }
            });
        }
    }

    // historyコマンドの出力情報を加工してレイヤ情報を作成するメソッド
    splitHistoryInfo(historyStr: string) {
        const lines = historyStr.split('\n');

        // historyコマンドの出力情報のうち最終行からベースイメージ部分に該当する範囲を求める
        let count = 0;
        let baseImageEndPos = 0;
        for (let i = 0; i < lines.length; i++) {
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if (elements[2].startsWith('RUN') || elements[2].startsWith('ADD') || elements[2].startsWith('COPY') || elements[2].startsWith('WORKDIR')) {
                count++;
            }
            if (count === (this.dfileMonitor.originalTextGroup.length - 1)) {
                baseImageEndPos = (i + 1);
                break;
            }
        };

        // ベースイメージのサイズを求める
        let baseImageSize = 0;
        for (let i = (lines.length - 1); i >= baseImageEndPos; i--) {
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if (elements.length >= 3 && typeof elements[2] === 'string') {
                for (let j = 3; j < elements.length; j++) {
                    if (/^\d/.test(elements[j])) { // 文字列の先頭が数字か調べる
                        baseImageSize += parseInt(elements[j]);
                        break;
                    }
                }
            }
        }

        // レイヤ情報を作成
        let layer = new Layer(this.dfileMonitor.originalTextGroup[0], baseImageSize.toString(), '');
        this.layerArray.push(layer);
        for (let i = (baseImageEndPos - 1); i >= 0; i--) {
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if (elements.length >= 3 && typeof elements[2] === 'string' &&
                (elements[2].includes('RUN') || elements[2].includes('ADD') || elements[2].includes('COPY') || elements[2].includes('WORKDIR'))) {
                for (let j = 3; j < elements.length; j++) {
                    if (/^\d/.test(elements[j])) { // 文字列の先頭が数字か調べる
                        layer = new Layer(elements[2], elements[j], '');
                        this.layerArray.push(layer);
                    }
                }
            }
        }
    }

    // buildコマンドの出力情報を加工してレイヤ情報に追加するメソッド
    splitBuildInfo(buildInfoStr: string) {
        const groups = buildInfoStr.split(/\n\s*\n/);
        // デバッグ用
        /* for (let i = 0; i < groups.length; i++) {
            console.log('group' + i + ' : ' + groups[i]);
        } */
        const tmplayerGroup = Array.from(new Set(groups)); // 重複する要素を削除
        const tmp2layerGroup = tmplayerGroup.filter(group => /\[\s*\d+\/\d+\]/.test(group));
        const tmp3layerGroup = tmp2layerGroup.filter(group => /DONE \d+\.\d+s|CACHED/.test(group));
        const layerGroup = tmp3layerGroup.filter(group => /FROM|RUN|COPY|ADD|WORKDIR/.test(group));

        // レイヤを古いものから順にソート
        const sortedLayerGroup = layerGroup.sort((a, b) => {
            const getStep = (str: string) => {
                const match = str.match(/\[\s*(\d+)\/\d+\]/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getStep(a) - getStep(b);
        });

        this.layerArray.forEach((layer, i) => {
            let match = sortedLayerGroup[i].match(/(?:DONE\s(\d+\.\d+s))|CACHED/);
            if (match) {
                if (match[1]) {
                    layer.buildTime = match[1];
                } else {
                    layer.buildTime = 'CACHED';
                }
            }
        })
    }

    // 外部ファイル・ディレクトリ情報をレイヤ情報に追加するメソッド
    addFileDirInfo(subjectPath: string) {
        const pattern = /^(COPY|ADD)\s+\S+/;

        this.layerArray.forEach(layer => {
            let match = layer.code.match(pattern);
            if (match) {
                let source = match[0].split(/\s+/)[1];  // コピー元のパスを取得
                this.handlePath(source, layer.fileDirArray, subjectPath);  // パスの処理を行う
            }
        });
    }

    // パスを処理するメソッド
    handlePath(source: string, fileDirArray: string[], subjectPath: string) {
        if (this.isUrl(source)) {
            fileDirArray.push(source);  // パスがURLの場合はそのまま配列に追加
        } else {
            const resolvedPath = path.join(subjectPath, source);  // 相対パスを絶対パスに変換
            if (fs.existsSync(resolvedPath)) {  // パスが存在するかチェック
                const stats = fs.statSync(resolvedPath);  // パスのステータスを取得
                if (stats.isFile()) {
                    fileDirArray.push(resolvedPath);
                    this.fileDirMonitor.initialStructure.push(resolvedPath);
                    const data = fs.readFileSync(resolvedPath, 'utf8');
                    this.fileDirMonitor.initialFileContents.set(resolvedPath, data);
                } else if (stats.isDirectory()) {
                    fileDirArray.push(resolvedPath);
                    this.fileDirMonitor.initialStructure.push(resolvedPath);
                    this.getALLFilesDirs(resolvedPath, fileDirArray);  // 再帰的に全ファイル・ディレクトリを取得
                }
            }
        }
    }

    // パスがURLかどうかを判定するメソッド
    isUrl(path: string): boolean {
        try {
            new URL(path);
            return true;
        } catch (_) {
            return false;
        }
    }

    // ディレクトリ内の全ファイルを取得するメソッド
    getALLFilesDirs(currentPath: string, fileDirArray: string[]) {
        const entries = fs.readdirSync(currentPath);  // ディレクトリ内の全ファイル・ディレクトリを同期的に取得
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry);
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
                fileDirArray.push(fullPath);
                this.fileDirMonitor.initialStructure.push(fullPath);
                const data = fs.readFileSync(fullPath, 'utf8');
                this.fileDirMonitor.initialFileContents.set(fullPath, data);
            } else if (stats.isDirectory()) {
                fileDirArray.push(fullPath);
                this.fileDirMonitor.initialStructure.push(fullPath);
                this.getALLFilesDirs(fullPath, fileDirArray);  // 再帰的に全ファイル・ディレクトリを取得
            }
        }
    }

    // 過去のビルドコメントを全て取得するメソッド
    setCommentArray(layerView: LayerView) {
        for (let i = 0; i < layerView.radioCnt; i++) {
            layerView.commentArray[i] = this.stateArray[i].layerView.comment;
        }
    }

}