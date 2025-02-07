import * as vscode from 'vscode';
import { DockerParser } from "./dockerParser";
import { Drawer } from "./drawer";

export class DfileMonitor {

    editor : vscode.TextEditor;
    originalTextGroup : string[];
    dfileActiveFlag : boolean;

    constructor(editor : vscode.TextEditor) {
        this.editor = editor;
        this.originalTextGroup = new Array();
        this.dfileActiveFlag = true;
    }

    // dfileテキストの構文解析を行う関数
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

    // dfileの編集有無を検出する関数
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

    // dfileの変更をビューに反映する関数
    setdfileChange(drawer:Drawer, dockerParser:DockerParser){
        const document = this.editor.document;
        const text = document.getText().replace(/\#.*\r?\n/g, '\n');

        // 編集後のdfileを構文解析する
        const newTextGroup = this.textparse(text);

        const arrayLength = (this.originalTextGroup.length < newTextGroup.length) ? this.originalTextGroup.length : newTextGroup.length;
        for(let i = 0; i < arrayLength; i++){
            // 改行文字を除いて比較
            let processedOriginalText = this.originalTextGroup[i].replace(/\r?\n|\r/g,'');
            let processedNewText = newTextGroup[i].replace(/\r?\n|\r/g,'');
            if(processedNewText !== processedOriginalText){ // ビルド時のdfileとの差分がある場合
                // index=iを取得
                // このiがdrawer.dfilei以上→0～i-1を消してi以降を塗る+drawer.dfileiを更新
                // このiがdrawer.dfileiより小さい→i以降を塗る+drawer.dfileiを更新
                if(i >= drawer.dfileChangeLayeri){
                    let endLayerArrayIndex = 0;
                    if(i-1 < drawer.fileDirChangeLayeri){
                        endLayerArrayIndex = i-1;
                    }else{
                        endLayerArrayIndex = drawer.fileDirChangeLayeri-1;
                    }
                    drawer.changeRectangleColor(0, endLayerArrayIndex, false);
                }
                drawer.changeRectangleColor(i, dockerParser.layerArray.length-1, true);
                drawer.dfileChangeLayeri = i;

                const index = text.indexOf(newTextGroup[i]);
                if(index !== -1){
                    const lineNum = (text.slice(0, index).match(/\n/g) || []).length + 1;
                }
                return;
            }
        }
        // ビルド時のdfileに戻った場合
        // 全ての色を消した後
        // drawer.fileDiri以降を塗る(ただしdrawer.fileDiriはcomponentArrayの長さ未満でないといけない)
        // drawer.dfileiをcomponentArrayの長さに更新
        drawer.changeRectangleColor(0, dockerParser.layerArray.length-1, false); // 一度リセット
        if(drawer.fileDirChangeLayeri < dockerParser.layerArray.length){
            drawer.changeRectangleColor(drawer.fileDirChangeLayeri, dockerParser.layerArray.length-1, true);
        }
        drawer.dfileChangeLayeri = dockerParser.layerArray.length;
    }
    
}