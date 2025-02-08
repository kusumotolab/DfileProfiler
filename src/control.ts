import * as vscode from 'vscode';
import { LayerView } from './layerView';
import { DockerParser } from './dockerParser';
import { Drawer } from './drawer';
import { FileDirMonitor } from './fileDirMonitor';
import { DfileMonitor } from './dfileMonitor';
import { SidebarProvider } from './sidebarProvider';

let editor: any;
let layerView: LayerView;
let stateArray = new Array(); // ビルド結果の履歴
let panel: vscode.WebviewPanel | undefined = undefined;

export class Control {

    constructor(context: vscode.ExtensionContext) {
        // サイドバーの生成
        const sidebarProvider = new SidebarProvider(context, this);
    }

    // ビルド以降の制御を行うメソッド
    run(context: vscode.ExtensionContext, comment: string) {
        if (editor !== undefined && stateArray.length > 0) {
            // 前回ビルド時の描画状態を取得する
            const preLayerView = stateArray[stateArray.length - 1].layerView;
            // Dfileのハイライトをリセット
            for (let i = 0; i < preLayerView.componentArray.length; i++) {
                this.clearHighlight(preLayerView, i);
            };
            panel?.dispose(); // 既存のWebViewがあれば消す
        } else {
            // アクティブなエディタを取得
            editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Tool Launch Error! : Please click the "Build" button after selecting the Dockerfile.');
            }
            panel?.dispose(); // 既存のWebViewがあれば消す
        }
        // WebViewを作成
        panel = vscode.window.createWebviewPanel(
            'layerView',
            'Layer View',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );
        layerView = new LayerView(panel.webview, context.extensionUri, stateArray, comment);

        // 初期メッセージを表示
        const drawer = new Drawer(layerView, stateArray);

        // 監視役の生成
        const dfileMonitor = new DfileMonitor(editor);
        const fileDirMonitor = new FileDirMonitor(editor);

        // エディタ上に開かれている全てのファイルを保存
        const openDocuments = vscode.workspace.textDocuments;
        openDocuments.forEach(document => {
            if (document.isDirty) {  // 変更があるファイルのみ保存
                document.save();
            }
        });

        // ビルド時の解析とレイヤビューの描画を行う
        dfileMonitor.originalTextGroup = dfileMonitor.textparse(editor.document.getText());
        const dockerParser = new DockerParser(editor, drawer, dfileMonitor, fileDirMonitor, stateArray);
        dockerParser.run(layerView);

        // フォーカスの切り替えを行う
        this.handleFocus(dfileMonitor, dockerParser, panel);

        // Dfileの編集有無の監視を開始
        dfileMonitor.run(drawer, dockerParser);

        // 外部ファイル・ディレクトリの監視を開始
        fileDirMonitor.run(drawer, dockerParser);

        // WebViewのレイヤ選択とラジオボタン選択を検出
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'scrollToLine':
                        this.scrollToLine(layerView.componentArray[message.index].lineNum);
                        return;
                    case 'highlight':
                        this.highlightText(layerView, message.index);
                        return;
                    case 'clearHighlight':
                        this.clearHighlight(layerView, message.index);
                        return;
                    case 'radioSelected':
                        drawer.setDiffInfo(stateArray, 1.4, (layerView.radioCnt - 1) - message.index);
                        layerView.setComponentsScript();
                        layerView.radioIndex = message.index;
                        layerView.setCanvasScript(true);
                        layerView.setHtml();
                }
            },
            undefined,
            context.subscriptions
        );
    }

    // 該当の行までDfileをスクロールさせるメソッド
    scrollToLine(lineNum: number) {
        const range = editor.document.lineAt(lineNum).range;
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    }

    // Dfileにハイライトをつけるメソッド
    highlightText(layerView: LayerView, index: number) {
        if (!layerView.componentArray[index].decorationFlag) {
            // ハイライトの開始位置を指定
            const startLineNum = layerView.componentArray[index].lineNum;
            const startPos = new vscode.Position(startLineNum, 0);

            const document = editor.document;

            // ハイライトの終了位置を指定
            let endLineNum = (index + 1 < layerView.componentArray.length) ? layerView.componentArray[index + 1].lineNum - 1 : document.lineCount - 1;
            let endPos = new vscode.Position(endLineNum, document.lineAt(endLineNum).text.length);
            for (let i = startLineNum; i <= endLineNum; i++) {
                // 空白行がある場合、その直前を終了位置に変更
                if (document.lineAt(i).text.trim() === '') {
                    endPos = new vscode.Position(i - 1, document.lineAt(i - 1).text.length);
                    break;
                }
            }

            const range = new vscode.Range(startPos, endPos);
            layerView.componentArray[index].decoration = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,255,0,0.3)' });
            editor.setDecorations(layerView.componentArray[index].decoration, [range]);
            layerView.componentArray[index].decorationFlag = true;
        }
    }

    // Dfileのハイライトを消すメソッド
    clearHighlight(layerView: LayerView, index: number) {
        if (layerView.componentArray[index].decorationFlag) {
            editor.setDecorations(layerView.componentArray[index].decoration, []);
            layerView.componentArray[index].decorationFlag = false;
        }
    }

    // フォーカス処理をするメソッド
    handleFocus(dfileMonitor: DfileMonitor, dockerParser: DockerParser, panel: vscode.WebviewPanel) {
        // アクティブエディタの変更を検出
        vscode.window.onDidChangeActiveTextEditor((tmpEditor) => {
            if (tmpEditor) { // ファイルにフォーカスした場合
                if (tmpEditor?.document.getText() == editor.document.getText()) { // Dfileにフォーカスした場合
                    dfileMonitor.dfileActiveFlag = true;
                    editor = vscode.window.activeTextEditor;
                } else { // Dfile以外のファイルにフォーカスした場合
                    dfileMonitor.dfileActiveFlag = false;
                    // Dfileと異なるエディタグループで、フォーカスされているファイルのタブを取得
                    let targetTab = vscode.window.tabGroups.activeTabGroup.tabs.find(tab =>
                        tab.input instanceof vscode.TabInputText &&
                        tab.input.uri.toString() === tmpEditor.document.uri.toString() &&
                        tmpEditor.viewColumn !== editor.viewColumn
                    );
                    if (targetTab) {
                        // タブを閉じる
                        vscode.window.tabGroups.close(targetTab);
                        // Dfileと同じグループでファイルを開く
                        vscode.window.showTextDocument(tmpEditor.document, {
                            viewColumn: editor.viewColumn,
                            preview: false // プレビューではなく、常に新しいタブとして開く
                        });
                    }
                }
            }
        });
    }

}