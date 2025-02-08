import * as vscode from 'vscode';
import { Control } from './control';

export class SidebarProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'extension.sidebar';
    private static isRegistered = false; // 拡張機能が有効化済みか判定するフラグ
    control: Control;

    constructor(private readonly context: vscode.ExtensionContext, control: Control) {
        this.control = control;
        if (SidebarProvider.isRegistered) {
            vscode.window.showInformationMessage(
                'DfileProfiler is already activated; click the "Build" button to get started.'
            );
            return;
        }
        vscode.commands.executeCommand('workbench.view.extension.sidebarView');
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, this);
        SidebarProvider.isRegistered = true;
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this.setHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((comment) => {
            switch (comment.command) {
                case 'comment':
                    // ビルド以降の制御を開始
                    this.control.run(this.context, comment.text);
                    return;
            }
        });
    }

    // サイドバー用のHTMLをセットするメソッド
    setHtml(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sidebar</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 10px;
                    }
                    textarea {
                        width: 100%;
                        height: 80px;
                        margin-bottom: 10px;
                    }
                    button {
                        display: block;
                        width: 100%;
                        padding: 10px;
                        background-color: #007acc;
                        color: white;
                        border: none;
                        cursor: pointer;
                        border-radius: 5px;
                    }
                    button:hover {
                        background-color: #005fa3;
                    }
                </style>
            </head>
            <body>
                <textarea id="input" placeholder="Enter your comment"></textarea>
                <button id="executeButton">Build</button>
                <script>
                    const vscode = acquireVsCodeApi();

                    document.getElementById('executeButton').addEventListener('click', () => {
                        const input = document.getElementById('input');
                        const text = input.value;

                        vscode.postMessage({ command: 'comment', text });
                    });
                </script>
            </body>
            </html>
        `;
    }

}