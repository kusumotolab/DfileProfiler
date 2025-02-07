import * as vscode from 'vscode';
import { Control } from './control';

// 拡張機能有効時に呼び出される関数
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('dfileProfiler.start', async () => {
			const control = new Control(context);
		})
	);
}

// 拡張機能無効時に呼び出される関数
export function deactivate() {

}
