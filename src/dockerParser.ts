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

const prettydiff = require('prettydiff');

export class DockerParser {
    // プロパティ
    editor : vscode.TextEditor;
    layerArray : any[];
    drawer : Drawer;
    dfileMonitor : DfileMonitor;
    fileDirMonitor : FileDirMonitor;
    stateArray : State[];
    normalEndFlag : boolean;

    // コンストラクタ
    constructor(editor:vscode.TextEditor, drawer:Drawer, dfileMonitor:DfileMonitor, fileDirMonitor : FileDirMonitor, stateArray:State[]) {
        this.editor = editor;
        this.layerArray = new Array();
        this.drawer = drawer;
        this.dfileMonitor = dfileMonitor;
        this.fileDirMonitor = fileDirMonitor;
        this.stateArray = stateArray;
        this.normalEndFlag = false;
    }

    run(layerView:LayerView){
        if(this.dfileMonitor.dfileActiveFlag){
            // エディタのテキスト(dfileの内容)を取得
            const editorText = this.editor.document.getText();
        
            const dockerfilePath = this.editor?.document.uri.fsPath;
            if (!dockerfilePath) {
                vscode.window.showErrorMessage('File Open Error! : Please restart VSCode.');
            }
            const lastSeparatorIndex = Math.max(dockerfilePath.lastIndexOf('/'), dockerfilePath.lastIndexOf('\\'));
            const buildContext = dockerfilePath.substring(0, lastSeparatorIndex);
            console.log('ビルドコンテキスト = ' + buildContext);
        
            // buildコマンドを実行
            layerView.header1 = 'Building......';
            layerView.loading = `var gif = document.getElementById('loading');
            gif.style.display = 'block'; // GIFを表示`;
            layerView.setHtml();

            let buildLog = '';
            // Dockerビルドのコマンドをspawnで実行
            let buildProcess = spawn('docker', ['build', '--progress=plain', '-t', 'myimage', '-f', dockerfilePath, buildContext]);

            // 標準出力をWebviewに送信
            buildProcess.stdout.on('data', (data:any) => {
                console.log(data.toString());
            });

            // 標準エラー出力をWebviewに送信
            buildProcess.stderr.on('data', (data:any) => {
                layerView.webview.postMessage({ type: 'stderr', text: data.toString() });
                console.log(data.toString());
                buildLog += data.toString();
            });

            // プロセスが終了したときの処理
            buildProcess.on('close', async (code:any) => {
                if (code === 0) {
                    // ビルドが成功した場合にログをクリアするメッセージを送信
                    layerView.webview.postMessage({ type: 'clear' });

                    layerView.header1 = 'Drawing......';
                    layerView.setHtml();

                    // historyコマンドを実行
                    let historyRes = await exec(`docker history --human=false myimage`, {maxBuffer: 50 * 1024 * 1024});
                    console.log(historyRes.stdout);

                    // <none>イメージを一括削除する
                    exec(`docker image prune -f`);
                
                    //レイヤー情報を作成
                    this.splitHistoryInfo(historyRes.stdout);
                    this.splitBuildInfo(buildLog);
                    this.addFileDirInfo(buildContext);
                    console.log("初期状態 : " + this.fileDirMonitor.initialStructure);

                    // 過去のビルドコメントを全て取得
                    // 上限に達している場合は一番古いStateを削除しておく
                    if(this.stateArray.length > 5){ // ここで保持しておく過去のビルド数を設定
                        this.stateArray.shift();
                    }
                    layerView.radioCnt = this.stateArray.length;
			        this.setCommentArray(layerView);

                    // レイヤービューに描画
                    this.drawer.run(editorText, this.layerArray);

                    this.drawer.dfileChangeLayeri = this.layerArray.length;
                    this.drawer.fileDirChangeLayeri = this.layerArray.length;

                    // ビルド時の描画状態を保存する
                    console.log('stateをpushした');
                    this.stateArray.push(new State(layerView));
                    this.normalEndFlag = true;
                } else {
                    // ビルドが失敗した場合
                    layerView.webview.postMessage({ type: 'close'});
                }
            });
        }
    }
    
    // historyコマンドの結果を加工してレイヤー情報を作成する関数
    splitHistoryInfo(historyStr:string){
        const lines = historyStr.split('\n');

        // historyコマンドの結果のうち最終行からbaseImage部分に該当するレイヤーの範囲を求める
        let count = 0;
        let baseImageEndPos = 0;
        for(let i = 0; i < lines.length; i++){
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if(elements[2].startsWith('RUN') || elements[2].startsWith('ADD') || elements[2].startsWith('COPY') || elements[2].startsWith('WORKDIR')){
                console.log('elements[2] = ' + elements[2]);
                count++;
            }
            if(count === (this.dfileMonitor.originalTextGroup.length-1)){
                baseImageEndPos = (i+1);
                break;
            }
        };
        console.log('baseImageEndPos = ' + baseImageEndPos);

        // baseImageのサイズを求める
        let baseImageSize = 0;
        for(let i = (lines.length-1); i >= baseImageEndPos; i--){
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if(elements.length >= 3 && typeof elements[2] === 'string'){
                for(let j = 3; j < elements.length; j++){
                    if(/^\d/.test(elements[j])){ // 文字列の先頭が数字か調べる
                        baseImageSize += parseInt(elements[j]);
                        break;
                    }
                }
            }
        }
        console.log('baseImageSize = ' + baseImageSize);
        
        // レイヤーのインスタンスを作成
        let layer = new Layer(this.dfileMonitor.originalTextGroup[0], baseImageSize.toString(), '');
        this.layerArray.push(layer);
        for(let i = (baseImageEndPos-1); i >= 0; i--){
            const elements = lines[i].split(/\s{3,}/); // 半角スペース3つ以上で分割する
            if(elements.length >= 3 && typeof elements[2] === 'string' &&
                (elements[2].includes('RUN') || elements[2].includes('ADD') || elements[2].includes('COPY') || elements[2].includes('WORKDIR'))){
                for(let j = 3; j < elements.length; j++){
                    if(/^\d/.test(elements[j])){ // 文字列の先頭が数字か調べる
                        layer = new Layer(elements[2], elements[j], '');
                        this.layerArray.push(layer);
                    }
                }
            }
        }
    }
    
    // buildコマンドのログを加工してレイヤー情報を作成する関数
    splitBuildInfo(buildInfoStr:string){
        console.log('buildRes: ', buildInfoStr);
        const groups = buildInfoStr.split(/\n\s*\n/);
        for(let i = 0; i < groups.length; i++){
            console.log('group' + i + ' : ' + groups[i]);	
        }
        const tmplayerGroup = Array.from(new Set(groups)); // 重複する要素を削除
        const tmp2layerGroup = tmplayerGroup.filter(group => /\[\s*\d+\/\d+\]/.test(group));
        const tmp3layerGroup = tmp2layerGroup.filter(group => /DONE \d+\.\d+s|CACHED/.test(group));
        const layerGroup = tmp3layerGroup.filter(group => /FROM|RUN|COPY|ADD|WORKDIR/.test(group));
        console.log('layerGrop: ' + layerGroup);
    
        // レイヤーを古いものから順にソートし直す
        const sortedLayerGroup = layerGroup.sort((a, b) => {
            const getStep = (str: string) => {
              const match = str.match(/\[\s*(\d+)\/\d+\]/);
              return match ? parseInt(match[1], 10) : 0;
            };
            return getStep(a) - getStep(b);
        });  
        console.log('sortedLayerGroup: ' + sortedLayerGroup);
        
        this.layerArray.forEach((layer, i) => {
            let match = sortedLayerGroup[i].match(/(?:DONE\s(\d+\.\d+s))|CACHED/);
            if(match){
                if(match[1]){
                    layer.buildTime = match[1]; // 秒数を取得
                }else{
                    layer.buildTime = 'CACHED'; // CACHEDを取得
                }
            }
            console.log("layerArrayの各要素 = " + layer.code + ' : ' + layer.size + ' : ' + layer.buildTime);
        })
    }

    // ファイル・ディレクトリ情報をレイヤー情報に追加する関数
    addFileDirInfo(subjectPath:string){
        const pattern = /^(COPY|ADD)\s+\S+/;

        // COPY・ADDコマンドを検索し、マッチするたびに処理
        this.layerArray.forEach(layer => {
            console.log('layer.code =' +  layer.code);
            let match = layer.code.match(pattern);
            if(match){
                let source = match[0].split(/\s+/)[1];  // コピー元のパスを取得
                console.log('source =' +  source);
                this.handlePath(source, layer.fileDirArray, subjectPath);  // パスの処理を行う関数を呼び出し
            }
            console.log(layer.code + "のfileDirArray");
        });
    }
    
    // パスを処理する関数
    handlePath(source: string, fileDirArray: string[], subjectPath:string) {
        // パスがURLかどうかをチェック
        if (this.isUrl(source)) {
            fileDirArray.push(source);  // URLの場合はそのまま配列に追加
        } else {
            const resolvedPath = path.join(subjectPath, source);  // 相対パスを絶対パスに変換
            console.log('resolvedPath = ' + resolvedPath);
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
  
    // パスがURLかどうかを判定する関数
    isUrl(path: string): boolean {
        try {
            new URL(path);
            return true;
        } catch (_) {
            return false;
        }
    }
  
    // ディレクトリ内の全ファイルを取得する関数
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
                this.getALLFilesDirs(fullPath, fileDirArray);  // ディレクトリの場合は再帰的に処理
            }
        }
    }

    // 過去のビルドコメントを全て取得する関数
    setCommentArray(layerView:LayerView){
         for(let i = 0; i < layerView.radioCnt; i++){

            layerView.commentArray[i]  = this.stateArray[i].layerView.comment;
        }
    }
}