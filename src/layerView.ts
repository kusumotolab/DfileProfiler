import * as vscode from 'vscode';
import { LayerViewComponent } from './layerViewComponent';
import { State } from './state';

export class LayerView {

    webview: vscode.Webview;
    extensionUri: vscode.Uri;
    header1 = '';
    header2 = '';
    loading = `var gif = document.getElementById('loading');
    gif.style.display = 'none'; // GIFを非表示`;
    resizeScript = '';
    canvasScript = '';
    componentsScript = '';
    componentArray: LayerViewComponent[];
    totalComponent: LayerViewComponent | undefined;
    stateArray: State[];
    radioIndex = 0;
    radioCnt = 0;
    comment: string;
    commentArray: string[];

    constructor(webview: vscode.Webview, extensionUri: vscode.Uri, stateArray: State[], comment: string) {
        this.webview = webview;
        this.extensionUri = extensionUri;
        this.stateArray = stateArray;
        this.comment = comment;
        this.componentArray = new Array();
        this.commentArray = new Array();
    }

    setHtml() {
        // cssのパスを指定
        const styleUri = this.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css'));

        let htmlStr = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dfile View</title>
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div id="container">
                <div style="display: flex; align-items: center;">
                    <h2>${this.header1}</h2>
                    <img id="loading" src="${this.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'loading.gif'))}" style="margin-left: 30px; vertical-align: middle;" />
                </div>

                <div id="log" style="overflow-y: auto;"></div>
                <div>
                    <button id="tab-relFig" class="tab-button">Relative</button>
                    <button id="tab-diffFig" class="tab-button">Diff</button>
                </div>
                <div class="canvas-wrapper">
                    <canvas id="canvas-common" width="650" height="600"></canvas>
                    <canvas id="canvas-relFig" width="650" height="600"></canvas>
                    <canvas id="canvas-diffFig" width="650" height="600"></canvas>
                    <canvas id="canvas-cursor" width="650" height="600"></canvas>
                </div>

                <div id="radio-container" class="radio-group"></div>
            </div>
            <script>
                ${this.loading}
                const vscode = acquireVsCodeApi();

                ${this.resizeScript}

                const logDiv = document.getElementById('log');
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'stderr') {
                        // ログエリアの高さを計算し設定
                        const windowHeight = window.innerHeight;
                        const headerHeight = document.querySelector('h2').offsetHeight;
                        const logHeight = windowHeight - headerHeight - 40; // マージンを考慮
                        logDiv.style.height = logHeight + 'px';

                        logDiv.innerHTML += '<pre>' + message.text + '</pre>';
                        logDiv.scrollTop = logDiv.scrollHeight; // ログが追加されるたびにスクロール
                    } else if (message.type === 'clear') {
                        // ログをクリア
                        logDiv.innerHTML = '';
                    } else if (message.type === 'close') {
                        logDiv.innerHTML += '<p style="color: red">Build Error!</p>';
                        logDiv.scrollTop = logDiv.scrollHeight; // ビルドエラー時もスクロール
                        var gif = document.getElementById('loading');
                        gif.style.display = 'none'; // GIFを非表示
                    }
                });
                ${this.canvasScript}
            </script>
            <h2>${this.header2}</h2>
        </body>
        </html>`;

        this.webview.html = htmlStr;

        // デバッグ用
        /* const filePath: string = "./output.txt";
        try {
            fs.writeFileSync(filePath, this.webview.html);
            console.log("ファイルが正常に書き込まれました:", filePath);
        }catch(e){
            console.error("ファイルの書き込み中にエラーが発生しました:", e);
        } */

    }

    // canvasScript中のcomponentsを記述する関数
    setComponentsScript() {
        let tmpComponentsScript = 'const totalComponent = \n'
            + '{ size:' + '\'' + this.totalComponent?.convertedSize + '\''
            + ', sizeRectangle: { x: ' + this.totalComponent?.sizeRectangle.x
            + ', y: ' + this.totalComponent?.sizeRectangle.y
            + ', width: ' + this.totalComponent?.sizeRectangle.width
            + ', height: ' + this.totalComponent?.sizeRectangle.height
            + ', info: ' + '\'' + this.totalComponent?.sizeRectangle.info + '\''
            + ', color: ' + '\'' + this.totalComponent?.sizeRectangle.color + '\''
            + ' }'
            + ', buildTime: ' + '\'' + this.totalComponent?.buildTime + '\''
            + ', buildTimeRectangle: { x: ' + this.totalComponent?.buildTimeRectangle.x
            + ', y: ' + this.totalComponent?.buildTimeRectangle.y
            + ', width: ' + this.totalComponent?.buildTimeRectangle.width
            + ', height: ' + this.totalComponent?.buildTimeRectangle.height
            + ', info: ' + '\'' + this.totalComponent?.buildTimeRectangle.info + '\''
            + ', color: ' + '\'' + this.totalComponent?.buildTimeRectangle.color + '\''
            + ' }'
            + ' };\n';

        tmpComponentsScript += 'const rowBackGrounds = [\n';
        this.componentArray.forEach(component => {
            tmpComponentsScript += ('{ x: ' + 0
                + ', y: ' + (component.sizeRectangle.y - 7 / 2) // 7 => drawerのlineSpaceと一致させること!
                + ', width: canvasCommon.width'
                + ', height: ' + (component.sizeRectangle.height + 7) // 7 => drawerのlineSpaceと一致させること!
                + ', color: ' + (component.index % 2 === 0 ? '\'whitesmoke\'' : '\'white\'') // グレーと白の交互
                + ' },\n');
        });
        let tmpComponentsScript2 = tmpComponentsScript.slice(0, -2); // 最後の',\n'を削除
        tmpComponentsScript2 += '];\n';


        tmpComponentsScript2 += 'const components = [\n';
        this.componentArray.forEach(component => {
            tmpComponentsScript2 += ('{ index:' + component.index
                + ', instruction: ' + '\'' + component.instruction + '\''
                + ', size:' + '\'' + component.convertedSize + '\''
                + ', sizeRectangle: { x: ' + component.sizeRectangle.x
                + ', y: ' + component.sizeRectangle.y
                + ', width: ' + component.sizeRectangle.width
                + ', height: ' + component.sizeRectangle.height
                + ', info: ' + '\'' + component.sizeRectangle.info + '\''
                + ', color: ' + '\'' + component.sizeRectangle.color + '\''
                + ' }'
                + ', buildTime: ' + '\'' + component.buildTime + '\''
                + ', buildTimeRectangle: { x: ' + component.buildTimeRectangle.x
                + ', y: ' + component.buildTimeRectangle.y
                + ', width: ' + component.buildTimeRectangle.width
                + ', height: ' + component.buildTimeRectangle.height
                + ', info: ' + '\'' + component.buildTimeRectangle.info + '\''
                + ', color: ' + '\'' + component.buildTimeRectangle.color + '\''
                + ' }'
                + ', rebuildFlag: ' + component.rebuildFlag
                + ' },\n');
        });
        this.componentsScript = tmpComponentsScript2.slice(0, -2); // 最後の',\n'を削除
        this.componentsScript += '];\n';

        this.componentsScript += 'const diffComponents = [\n';
        if (this.stateArray.length > 0) {

            this.componentsScript += ('{ x: ' + this.totalComponent?.sizeDiffRectangle?.x
                + ', y: ' + this.totalComponent?.sizeDiffRectangle?.y
                + ', width: ' + this.totalComponent?.sizeDiffRectangle?.width
                + ', height: ' + this.totalComponent?.sizeDiffRectangle?.height
                + ', color: ' + '\'' + this.totalComponent?.sizeDiffRectangle?.color + '\''
                + ' },\n');

            this.componentsScript += ('{ x: ' + this.totalComponent?.buildTimeDiffRectangle?.x
                + ', y: ' + this.totalComponent?.buildTimeDiffRectangle?.y
                + ', width: ' + this.totalComponent?.buildTimeDiffRectangle?.width
                + ', height: ' + this.totalComponent?.buildTimeDiffRectangle?.height
                + ', color: ' + '\'' + this.totalComponent?.buildTimeDiffRectangle?.color + '\''
                + ' },\n');

            for (let i = 0; i < this.componentArray.length; i++) {
                if (this.componentArray[i].sizeDiffRectangle !== undefined) {
                    this.componentsScript += ('{ x: ' + this.componentArray[i].sizeDiffRectangle?.x
                        + ', y: ' + this.componentArray[i].sizeDiffRectangle?.y
                        + ', width: ' + this.componentArray[i].sizeDiffRectangle?.width
                        + ', height: ' + this.componentArray[i].sizeDiffRectangle?.height
                        + ', color: ' + '\'' + this.componentArray[i].sizeDiffRectangle?.color + '\''
                        + ' },\n');
                }
                if (this.componentArray[i].buildTimeDiffRectangle !== undefined) {
                    this.componentsScript += ('{ x: ' + this.componentArray[i].buildTimeDiffRectangle?.x
                        + ', y: ' + this.componentArray[i].buildTimeDiffRectangle?.y
                        + ', width: ' + this.componentArray[i].buildTimeDiffRectangle?.width
                        + ', height: ' + this.componentArray[i].buildTimeDiffRectangle?.height
                        + ', color: ' + '\'' + this.componentArray[i].buildTimeDiffRectangle?.color + '\''
                        + ' },\n');
                }
            }
            this.componentsScript = this.componentsScript.slice(0, -2); // 最後の',\n'を削除
        }
        this.componentsScript += '];\n';

        this.componentsScript += 'const commentArray = [\n';
        if (this.commentArray.length > 0) {
            this.commentArray.forEach(comment => {
                this.componentsScript += ('\`' + comment + '\`' + ',\n');
            });
            this.componentsScript = this.componentsScript.slice(0, -2); // 最後の',\n'を削除*/
        }
        this.componentsScript += '];\n';
    }

    // canvasScriptを記述する関数
    setCanvasScript(byRadioSet: boolean) {
        this.canvasScript = `
            // ログエリアの高さをリセットして空白を削除
            logDiv.style.height = '0';

            // WebViewの構成要素を取得
            document.getElementById('tab-relFig').style.display = 'inline-block';
            document.getElementById('tab-diffFig').style.display = 'inline-block';
            document.querySelector('.canvas-wrapper').style.display = 'block';
            const canvasCommon = document.getElementById('canvas-common');
            const canvasRelFig = document.getElementById('canvas-relFig');
            const canvasDiffFig = document.getElementById('canvas-diffFig');
            const canvasCursor = document.getElementById('canvas-cursor');
            const ctxCommon = canvasCommon.getContext('2d');
            const ctxRelFig = canvasRelFig.getContext('2d');
            const ctxDiffFig = canvasDiffFig.getContext('2d');
            const ctxCursor = canvasCursor.getContext('2d');
            const tooltip = document.createElement('div');
            tooltip.id = 'tooltip';
            document.body.appendChild(tooltip);
            const tabRelFig = document.getElementById('tab-relFig');
            const tabDiffFig = document.getElementById('tab-diffFig');

            ${this.componentsScript}

            // 必要に応じて調整
            const fontSize = '15';
            ctxCommon.font = '15px Consolas';
            ctxRelFig.font = '15px Consolas';
            ctxDiffFig.font = '15px Consolas';
            ctxCommon.textBaseline = 'middle';
            ctxRelFig.textBaseline = 'middle';
            ctxDiffFig.textBaseline = 'middle';

            // タブのイベントを追加
            tabRelFig.addEventListener('click', () => {
                canvasCommon.style.display = 'block';
                canvasRelFig.style.display = 'block';
                canvasDiffFig.style.display = 'none';
                canvasCursor.style.display = 'block';
                tabRelFig.classList.add('active');
                tabDiffFig.classList.remove('active');
                radioContainer.style.display = 'none';
            });
            tabDiffFig.addEventListener('click', () => {
                canvasCommon.style.display = 'block';
                canvasRelFig.style.display = 'none';
                canvasDiffFig.style.display = 'block';
                canvasCursor.style.display = 'block';
                tabRelFig.classList.remove('active');
                tabDiffFig.classList.add('active');
                radioContainer.style.display = 'flex';
            });
            
            // 表示設定
            tabRelFig.click();
            
            const radioButtonCount = ${this.radioCnt};
            const radioContainer = document.getElementById('radio-container');

            if(radioButtonCount > 0){

                // ナビゲーション用のボタンを作成
                const leftButton = document.createElement('button');
                leftButton.innerText = '<';
                leftButton.disabled = true; // 初期状態で無効
                radioContainer.appendChild(leftButton);

                // ラジオボタンを生成
                let radioX = 0;
                for (let i = 0; i < radioButtonCount; i++) {
                    const radioButton = document.createElement('input');
                    radioButton.type = 'radio';
                    radioButton.name = 'canvas-options';
                    radioContainer.appendChild(radioButton);
                    if(i == 0){
                        //const rect = radioContainer.getBoundingClientRect();
                        //radioX = (rect.left + 10);
                        // ctxDiffFig.fillText('New', radioX, 30+rect.top+(rect.bottom-rect.top)/2);
                        radioContainer.children[1].checked = true;
                    }else{
                        radioX += 30;
                    }
                    if(i == (radioButtonCount-1)){
                        // const rect = radioContainer.getBoundingClientRect();
                        // ctxDiffFig.fillText('Old', radioX+85, 30+rect.top+(rect.bottom-rect.top)/2);
                    }

                    // マウスオーバーイベントを追加
                    radioButton.addEventListener('mouseover', (event) => {
                        tooltip.innerText = commentArray[radioButtonCount-1-i]; // ツールチップにコメントを表示
                        tooltip.style.visibility = 'visible';

                        // マウス位置に合わせてツールチップを配置
                        const rect = radioButton.getBoundingClientRect();
                        tooltip.style.left = (rect.left + 8) + 'px';
                        tooltip.style.top = (rect.top + 8) + 'px';

                        //tooltip.style.left = rect.left + window.scrollX + 'px';
                        //tooltip.style.top = rect.top + window.scrollY - 30 + 'px';
                    });

                    // マウスアウトイベントを追加
                    radioButton.addEventListener('mouseout', () => {
                        tooltip.style.visibility = 'hidden';
                    });

                    // クリックイベントを追加
                    radioButton.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'radioSelected', // メッセージタイプ
                            index: i // クリックされたラジオボタンの値
                        });
                    });
                }

                // ナビゲーション用のボタンを作成
                const rightButton = document.createElement('button');
                rightButton.innerText = '>';
                if(radioButtonCount == 1){
                    rightButton.disabled = true; // 初期状態で無効
                }
                radioContainer.appendChild(rightButton);

                // 左ボタンのクリックイベント
                leftButton.addEventListener('click', () => {
                    const selectedIndex = getSelectedRadioIndex();
                    if (selectedIndex > 0) {
                        // 最初の要素は左ボタンなので +1
                        radioContainer.children[selectedIndex + 1].checked = false;
                        radioContainer.children[selectedIndex].checked = true;
                        vscode.postMessage({
                            command: 'radioSelected', // メッセージタイプ
                            index: (selectedIndex - 1) // 選択状態になったラジオボタンの値
                        });
                        updateNavigationButtons();
                    }
                });

                // 右ボタンのクリックイベント
                rightButton.addEventListener('click', () => {
                    const selectedIndex = getSelectedRadioIndex();
                    if (selectedIndex < radioButtonCount - 1) {
                        // 最初の要素は左ボタンなので +1
                        radioContainer.children[selectedIndex + 1].checked = false;
                        radioContainer.children[selectedIndex + 2].checked = true;
                        vscode.postMessage({
                            command: 'radioSelected', // メッセージタイプ
                            index: (selectedIndex + 1) // 選択状態になったラジオボタンの値
                        });
                        updateNavigationButtons();
                    }
                });

                // 選択中のラジオボタンのインデックスを取得
                function getSelectedRadioIndex() {
                    for (let i = 0; i < radioButtonCount; i++) {
                        if (radioContainer.children[i + 1].checked) { // 最初の要素は左ボタンなので +1
                            return i;
                        }
                    }
                    return -1;
                }

                // ナビゲーションボタンの有効/無効状態を更新
                function updateNavigationButtons() {
                    const selectedIndex = getSelectedRadioIndex();
                    leftButton.disabled = (selectedIndex === 0);
                    rightButton.disabled = (selectedIndex === radioButtonCount - 1);
                }
                `

        if (byRadioSet) { // ラジオボタンからの呼び出しの場合
            this.canvasScript += `
                radioContainer.children[${this.radioIndex}+1].checked = true;
                tabDiffFig.click();
                updateNavigationButtons();`
        }

        this.canvasScript += `
            }

            // トータルレイヤーのキャプションを描画
            let x = 10;
            let y = 85;
            ctxCommon.fillStyle = 'black';
            ctxCommon.fillText('                 TotalSize', x, y);
            x = fontSize*15 + totalComponent.sizeRectangle.width + 35;
            ctxCommon.fillText('TotalBuildTime', x, y);

            // トータルレイヤーを描画
            x = 25 + fontSize*3 +fontSize*5;
            ctxRelFig.fillStyle = totalComponent.sizeRectangle.color;
            ctxRelFig.fillRect(totalComponent.sizeRectangle.x, totalComponent.sizeRectangle.y, totalComponent.sizeRectangle.width, totalComponent.sizeRectangle.height);
            x += totalComponent.sizeRectangle.width + 5;
            ctxRelFig.fillStyle = 'black';
            ctxRelFig.fillText(totalComponent.size, x, (totalComponent.sizeRectangle.y + totalComponent.sizeRectangle.height/2));
            ctxDiffFig.fillStyle = 'black';
            ctxDiffFig.fillText(totalComponent.sizeRectangle.info, x, (totalComponent.sizeRectangle.y + totalComponent.sizeRectangle.height/2));
            x += fontSize*7;
            ctxRelFig.fillStyle = totalComponent.buildTimeRectangle.color;
            ctxRelFig.fillRect(totalComponent.buildTimeRectangle.x, totalComponent.buildTimeRectangle.y, totalComponent.buildTimeRectangle.width, totalComponent.buildTimeRectangle.height); 
            x += totalComponent.sizeRectangle.width + 5;
            ctxRelFig.fillStyle = 'black';
            ctxRelFig.fillText(totalComponent.buildTime, x, (totalComponent.sizeRectangle.y + totalComponent.sizeRectangle.height/2));
            ctxDiffFig.fillStyle = 'black';
            ctxDiffFig.fillText(totalComponent.buildTimeRectangle.info, x, (totalComponent.sizeRectangle.y + totalComponent.sizeRectangle.height/2));

            // レイヤーテーブルのキャプションを描画
            x = 10;
            y =  totalComponent.buildTimeRectangle.y + totalComponent.buildTimeRectangle.height + 50;
            ctxCommon.fillStyle = 'black';
            ctxCommon.fillText('Index  Command   Size', x, y);
            x = fontSize*15 + totalComponent.sizeRectangle.width + 35;
            ctxCommon.fillText('BuildTime', x, y);

            // 各行の背景を描画
            rowBackGrounds.forEach(rowBackGround => {
                ctxCommon.fillStyle = rowBackGround.color;
                ctxCommon.fillRect(rowBackGround.x, rowBackGround.y, rowBackGround.width, rowBackGround.height);
            });

            // 前回のビルドとの差分を描画
            diffComponents.forEach(component => {
                ctxDiffFig.fillStyle = component.color;
                ctxDiffFig.fillRect(component.x, component.y, component.width, component.height);
            });

            // 各行の中身を描画
            ctxRelFig.setLineDash([]);
            components.forEach(component => {
                let x = 25; // 必要に応じて調整
                ctxCommon.fillStyle = 'black';
                // 表示用のインデックスは1スタートにする
                ctxCommon.fillText((component.index + 1), x, (component.sizeRectangle.y + component.sizeRectangle.height/2));
                x += fontSize*3;
                ctxCommon.fillText(component.instruction, x, (component.sizeRectangle.y + component.sizeRectangle.height/2));
                x += fontSize*5;
                ctxRelFig.fillStyle = component.sizeRectangle.color;
                ctxRelFig.fillRect(component.sizeRectangle.x, component.sizeRectangle.y, component.sizeRectangle.width, component.sizeRectangle.height);
                x += totalComponent.sizeRectangle.width + 5;
                ctxRelFig.fillStyle = 'black';
                ctxRelFig.fillText(component.size, x, (component.sizeRectangle.y + component.sizeRectangle.height/2));
                ctxDiffFig.fillStyle = 'black';
                ctxDiffFig.fillText(component.sizeRectangle.info, x, (component.sizeRectangle.y + component.sizeRectangle.height/2));
                x += fontSize*7;
                ctxRelFig.fillStyle = component.buildTimeRectangle.color;
                ctxRelFig.fillRect(component.buildTimeRectangle.x, component.buildTimeRectangle.y, component.buildTimeRectangle.width, component.buildTimeRectangle.height);
                x += totalComponent.sizeRectangle.width + 5;
                ctxRelFig.fillStyle = 'black';
                ctxRelFig.fillText(component.buildTime, x, (component.buildTimeRectangle.y + component.buildTimeRectangle.height/2));
                ctxDiffFig.fillStyle = 'black';
                ctxDiffFig.fillText(component.buildTimeRectangle.info, x, (component.buildTimeRectangle.y + component.buildTimeRectangle.height/2));
                x += fontSize*5;

                if(component.rebuildFlag){
                    var img = new Image();
                    // 画像のパスを指定
                    img.src = "${this.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.jpg'))}";
                    img.onload = () => {
                        ctxRelFig.drawImage(img, x, component.buildTimeRectangle.y, 25, 25);
                    };
                }else{
                    ctxRelFig.clearRect(x, component.buildTimeRectangle.y, 25, 25);
                }
            });

            // 直線表示関数
            function line(ctx,x1,y1,x2,y2,thick,color) {
                ctx.beginPath();            // 新しいパスを作成
                ctx.lineWidth = thick;      // 線の太さ
                ctx.strokeStyle = color;    // 線の色
                ctx.moveTo(x1,y1);          // 線の開始座標
                ctx.lineTo(x2,y2);          // 線の終了座標
                ctx.stroke();               // 輪郭を描画
            }

            // 直線描画
            line(ctxRelFig, 25+fontSize*8, components[0].sizeRectangle.y, 25+fontSize*8, components[components.length-1].sizeRectangle.y+components[components.length-1].sizeRectangle.height, 1, 'black');
            line(ctxRelFig, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7, components[0].buildTimeRectangle.y, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7, components[components.length-1].buildTimeRectangle.y+components[components.length-1].buildTimeRectangle.height, 1, 'black');
            line(ctxDiffFig, 25+fontSize*8+(totalComponent.sizeRectangle.width/2), totalComponent.sizeRectangle.y, 25+fontSize*8+(totalComponent.sizeRectangle.width/2), totalComponent.sizeRectangle.y+totalComponent.sizeRectangle.height, 1, 'black');
            line(ctxDiffFig, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7+(totalComponent.sizeRectangle.width/2), totalComponent.buildTimeRectangle.y, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7+(totalComponent.sizeRectangle.width/2), totalComponent.buildTimeRectangle.y+totalComponent.buildTimeRectangle.height, 1, 'black');
            line(ctxDiffFig, 25+fontSize*8+(totalComponent.sizeRectangle.width/2), components[0].sizeRectangle.y, 25+fontSize*8+(totalComponent.sizeRectangle.width/2), components[components.length-1].sizeRectangle.y+components[components.length-1].sizeRectangle.height, 1, 'black');
            line(ctxDiffFig, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7+(totalComponent.sizeRectangle.width/2), components[0].buildTimeRectangle.y, 25+fontSize*8+totalComponent.sizeRectangle.width+5+fontSize*7+(totalComponent.sizeRectangle.width/2), components[components.length-1].buildTimeRectangle.y+components[components.length-1].buildTimeRectangle.height, 1, 'black');

            // マウスオーバーで実行する処理
            canvasCursor.addEventListener('mousemove', function(event) {
                const rect = canvasCursor.getBoundingClientRect();
                const x = (event.clientX - rect.left) / scale;
                const y = (event.clientY - rect.top) / scale;

                let isCursorOverRow = false;

                ctxCursor.clearRect(0, 0, canvasCursor.width, canvasCursor.height);
                rowBackGrounds.forEach((rowBackGround, i) => {
                    if (y >= rowBackGround.y && y <= rowBackGround.y + rowBackGround.height) {
                        ctxCursor.strokeStyle = 'black';
                        ctxCursor.lineWidth = 1;
                        ctxCursor.strokeRect(rowBackGround.x, rowBackGround.y, rowBackGround.width, rowBackGround.height);

                        vscode.postMessage({
                            command: 'highlight',
                            index: i
                        });
                        isCursorOverRow = true;
                    }else{
                        vscode.postMessage({
                            command: 'clearHighlight',
                            index: i
                        });
                    }
                });

                // カーソルのスタイルを設定する
                if (isCursorOverRow) {
                    canvasCursor.style.cursor = 'pointer';  // カーソルを指のマークに変更
                } else {
                    canvasCursor.style.cursor = 'default';  // デフォルトのカーソルに戻す
                }

                let isInside = false;
                if (!isInside) {
                    tooltip.style.visibility = 'hidden';
                }

            });
            // マウスクリックで実行する処理
            canvasCursor.addEventListener('click', function(event) {
                const rect = canvasCursor.getBoundingClientRect();
                const x = (event.clientX - rect.left) / scale;
                const y = (event.clientY - rect.top) / scale;

                components.forEach(component => {
                    if (y >= component.sizeRectangle.y && y <= component.sizeRectangle.y + component.sizeRectangle.height) {
                        vscode.postMessage({
                            command: 'scrollToLine',
                            index: component.index
                        });
                    }
                });
            });`;
    }

}