import * as vscode from 'vscode';
import { DockerParser } from "./dockerParser";
import { Drawer } from "./drawer";

export class DfileMonitor {

    editor : vscode.TextEditor;
    originalTextGroup : string[]; // ビルド時点でのDfileを命令ごとに分割した配列
    dfileActiveFlag : boolean; // Dfileにフォーカスされているか判定するフラグ

    constructor(editor : vscode.TextEditor) {
        this.editor = editor;
        this.originalTextGroup = new Array(); 
        this.dfileActiveFlag = true;
    }

    // Dfileの構文解析を行うメソッド
    textparse(editorText:string) : string[]{
        let textGroup = new Array();

        const layerKeywords = ['RUN', 'ADD', 'COPY', 'WORKDIR'];
        const instructionKeywords = ['RUN', 'ADD', 'COPY', 'WORKDIR', 'LABEL', 'CMD', 'MAINTAINER', 
                                    'EXPOSE', 'ENV', 'ENTRYPOINT', 'VOLUME', 'USER', 'ARG', 'ONBUILD', 
                                    'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'];

        // FROMの処理
        textGroup.push(editorText.slice(editorText.indexOf('FROM'), editorText.indexOf('\n', editorText.indexOf('FROM')+1)));

        // コメント行を空白行に置換
        const tmpProcessedEditorText = editorText.replace(/\#.*\r?\n/g, '\n');

        // 改行文字を削除しない
        const processedEditorText = tmpProcessedEditorText;
        
        let searchStartPos = 0; // 検索の開始位置
        while(searchStartPos < processedEditorText.length){
            let sliceStartPos = -1; // 抽出の開始位置
            let sliceEndPos = -1; // 抽出の終了位置

            layerKeywords.forEach(keyword => {
                let tmpPos = processedEditorText.indexOf(keyword, searchStartPos);
                if (tmpPos !== -1 && (sliceStartPos === -1 || tmpPos < sliceStartPos)) {
                    sliceStartPos = tmpPos;
                }
            });
            searchStartPos = sliceStartPos + 4;
            
            if(sliceStartPos === -1){ // 抽出文字列が存在しない場合
                break;
            }

            instructionKeywords.forEach(keyword => {
                let tmpPos = (processedEditorText.indexOf(keyword, searchStartPos));
                if (tmpPos !== -1 && (sliceEndPos === -1 || tmpPos < sliceEndPos)) {
                    sliceEndPos = tmpPos - 1;
                }
            });

            let slicedStr = ''; 
            if(sliceEndPos !== -1){ // 抽出文字列の終端が決まっている場合
                slicedStr = processedEditorText.slice(sliceStartPos, sliceEndPos+1);
                searchStartPos = sliceEndPos + 1;
                textGroup.push(slicedStr);
            }else{
                slicedStr = processedEditorText.slice(sliceStartPos);
                textGroup.push(slicedStr);
                break;
            }
        }

        return textGroup;
    }

    // Dfileの編集を検知するメソッド
    run(drawer:Drawer, dockerParser:DockerParser){
        vscode.workspace.onDidChangeTextDocument(event => {
            if(this.dfileActiveFlag && dockerParser.normalEndFlag){
                const change = event.contentChanges[0];
                const startLine = change.range.start.line;
                const endLine = change.range.end.line;
                const changeText = change.text;
                const lineText = this.editor.document.lineAt(startLine).text;
                const firstChar = lineText.charAt(0);
                if(changeText.includes('\n') && (endLine - startLine) === 0){
                    if(firstChar === ''){
                        drawer.changeLineNum(startLine, 1);
                    }else{
                        drawer.changeLineNum(startLine+1, 1);
                    }
                }else if((endLine - startLine) > 0){
                    drawer.changeLineNum(endLine, -1);
                }

                this.setdfileChange(drawer, dockerParser);
            }
        });
    }

    // Dfileの変更をビューに反映するメソッド
    setdfileChange(drawer:Drawer, dockerParser:DockerParser){
        const document = this.editor.document;
        const text = document.getText().replace(/\#.*\r?\n/g, '\n');

        // 編集後のDfileを構文解析する
        const newTextGroup = this.textparse(text);

        const arrayLength = (this.originalTextGroup.length < newTextGroup.length) ? this.originalTextGroup.length : newTextGroup.length;
        for(let i = 0; i < arrayLength; i++){
            // 改行文字を除いて比較
            let processedOriginalText = this.originalTextGroup[i].replace(/\r?\n|\r/g,'');
            let processedNewText = newTextGroup[i].replace(/\r?\n|\r/g,'');
            if(processedNewText !== processedOriginalText){ // ビルド時のDfileとの差分がある場合
                if(i >= drawer.dfileChangeLayeri){
                    let endLayerArrayIndex = 0;
                    if(i-1 < drawer.fileDirChangeLayeri){
                        endLayerArrayIndex = i-1;
                    }else{
                        endLayerArrayIndex = drawer.fileDirChangeLayeri-1;
                    }
                    drawer.changeCacheIcon(0, endLayerArrayIndex, false);
                }
                drawer.changeCacheIcon(i, dockerParser.layerArray.length-1, true);
                drawer.dfileChangeLayeri = i;

                const index = text.indexOf(newTextGroup[i]);
                if(index !== -1){
                    const lineNum = (text.slice(0, index).match(/\n/g) || []).length + 1;
                }
                return;
            }
        }

        // ビルド時のDfileに戻った場合
        drawer.changeCacheIcon(0, dockerParser.layerArray.length-1, false); // 一度リセット
        if(drawer.fileDirChangeLayeri < dockerParser.layerArray.length){
            // 外部ファイル・ディレクトリの編集有無を反映
            drawer.changeCacheIcon(drawer.fileDirChangeLayeri, dockerParser.layerArray.length-1, true);
        }
        drawer.dfileChangeLayeri = dockerParser.layerArray.length;
    }
    
}