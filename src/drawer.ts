import { LayerView } from "./layerView";
import { Rectangle } from './rectangle';
import { LayerViewComponent } from './layerViewComponent';
import { State } from './state';

export class Drawer {

    layerView: LayerView;
    stateArray: State[];
    dfileChangeLayeri: number;
    fileDirChangeLayeri: number;

    constructor(layerView: LayerView, stateArray: State[]) {
        this.layerView = layerView;
        layerView.header1 = 'Welcome to DfileProfiler!';
        layerView.setHtml();
        this.stateArray = stateArray;
        this.dfileChangeLayeri = 0;
        this.fileDirChangeLayeri = 0;
    }

    // エディタをレイヤービューにマッピングして描画する関数
    run(editorText: string, layerArray: any[]) {
        const lines = editorText.split('\n');
        let layerArrayIndex = 0;

        // レイヤー配列からサイズ描画配列とビルド時間描画配列を作成
        // 各配列の要素は棒グラフの幅の長さ
        const scale = 1.4; // 棒グラフの倍率(必要に応じて調整)
        var sizeRectWidthArray = this.calculateRectWidth('size', layerArray, scale);
        var buildTimeRectWidthArray = this.calculateRectWidth('buildTime', layerArray, scale);

        // 棒グラフのx座標を指定(必要に応じて調整)
        const sizeX = 145;
        const buildTimeX = (sizeX + 100 * scale + 110);

        let lineHeight = 23; // 棒グラフの縦の長さ(高さ)(必要に応じて調整)
        let lineSpace = 7; // 棒グラフの間隔(必要に応じて調整)

        let totalSize = 0;
        let totalBuildTime = 0;

        let yOffset = 80; // 必要に応じて調整
        let y = lineHeight * 5 + yOffset; // 必要に応じて調整

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('FROM') || lines[i].startsWith('RUN') || lines[i].startsWith('ADD') || lines[i].startsWith('COPY') || lines[i].startsWith('WORKDIR')) {
                let instruction = '';
                if (lines[i].startsWith('FROM')) {
                    instruction = 'FROM';
                } else if (lines[i].startsWith('RUN')) {
                    instruction = 'RUN';
                } else if (lines[i].startsWith('ADD')) {
                    instruction = 'ADD';
                } else if (lines[i].startsWith('COPY')) {
                    instruction = 'COPY';
                } else if (lines[i].startsWith('WORKDIR')) {
                    instruction = 'WORKDIR';
                }

                totalSize += parseInt(layerArray[layerArrayIndex].size);
                totalBuildTime += (layerArray[layerArrayIndex].buildTime != 'CACHED') ? parseFloat(layerArray[layerArrayIndex].buildTime) : 0;

                // サイズ用の棒グラフ情報を作成
                const sizeRectangle = new Rectangle(sizeX, y, sizeRectWidthArray[layerArrayIndex], lineHeight, 'New Layer');
                // ビルド時間用の棒グラフ情報を作成
                const buildTimeRectangle = new Rectangle(buildTimeX, y, buildTimeRectWidthArray[layerArrayIndex], lineHeight, 'New Layer');
                // レイヤービュー1行分の構成要素を作成
                const layerViewComponent = new LayerViewComponent(layerArrayIndex, instruction, i, parseInt(layerArray[layerArrayIndex].size), layerArray[layerArrayIndex].buildTime, sizeRectangle, buildTimeRectangle);

                this.layerView.componentArray.push(layerViewComponent);
                y += (lineHeight + lineSpace);
                layerArrayIndex++;
            }
        }

        // トータルサイズ用の棒グラフ情報を作成
        y = lineHeight + yOffset;
        const totalSizeRectangle = new Rectangle(sizeX, y, 100 * scale, lineHeight, 'New Image');
        // トータルビルド時間用の棒グラフ情報を作成
        let totalBuildTimeRectangleWidth = (totalBuildTime !== 0) ? 100 * scale : 0;
        const totalBuildTimeRectangle = new Rectangle(buildTimeX, y, totalBuildTimeRectangleWidth, lineHeight, 'New Image');
        // レイヤービュー1行分(トータル部分)の構成要素を作成
        this.layerView.totalComponent = new LayerViewComponent(-1, '', -1, totalSize, ((Math.floor(totalBuildTime * 100) / 100).toString() + 's'), totalSizeRectangle, totalBuildTimeRectangle);

        // レイヤービューを更新
        this.layerView.header1 = 'Build Completed!';

        // 前回のビルドとの差分をビューに反映
        this.setDiffInfo(this.stateArray, scale, this.stateArray.length - 1);

        this.layerView.setComponentsScript();
        this.layerView.setCanvasScript(false);
        this.layerView.loading = `var gif = document.getElementById('loading');
                                  gif.style.display = 'none'; // GIFを非表示`;
        this.layerView.resizeScript
            = `const container = document.getElementById('container');
        let scale = 1;
        const updateScale = () => {
            const scaleX = window.innerWidth / container.clientWidth;
            const scaleY = window.innerHeight / container.clientHeight;
            scale = Math.min(scaleX, scaleY) * 0.23;
            container.style.transform = \`scale(\${scale})\`;
        };

        // 初期スケール設定
        updateScale();

        // リサイズイベントに対応するためリスナーを追加
        window.addEventListener('resize', updateScale);`;

        this.layerView.setHtml();
    }

    // レイヤー群から各棒グラフの幅の長さを算出する関数
    calculateRectWidth(property: string, layerArray: any[], scale: number) {
        let rectWidthArray = new Array();
        let total = 0;

        // トータルの計算
        layerArray.forEach(layer => {
            if (property === 'size') {
                total += parseFloat(layer.size);
            } else if (property === 'buildTime') {
                if (layer.buildTime != 'CACHED') {
                    total += parseFloat(layer.buildTime);
                }
            } else {
                // デバッグ用
                // console.error('Invalid property');
            }
        })

        // 割合の計算
        layerArray.forEach(layer => {
            if (property === 'size') {
                if (total !== 0) {
                    rectWidthArray.push((parseFloat(layer.size) / total) * 100 * scale);
                } else { // 0除算の場合
                    rectWidthArray.push(0);
                }
            } else if (property === 'buildTime') {
                if (layer.buildTime != 'CACHED') {
                    if (total !== 0) {
                        rectWidthArray.push((parseFloat(layer.buildTime) / total) * 100 * scale);
                    } else { // 0除算の場合
                        rectWidthArray.push(0);
                    }
                } else {
                    rectWidthArray.push(0);
                }
            } else {
                // デバッグ用
                // console.error('Invalid property');
            }
        })
        return rectWidthArray;
    }

    // 前回のビルド時との差分をビューに反映する関数
    setDiffInfo(stateArray: State[], scale: number, cmpIndex: number) {
        if (stateArray.length > 0) {
            const preLayerView = stateArray[cmpIndex].layerView;
            const currentLayerView = this.layerView;

            if (currentLayerView.totalComponent?.size && preLayerView.totalComponent?.size) {
                // 各レイヤーの差分を取得
                const sizeDiffArray = new Array();
                const buildTimeDiffArray = new Array();
                for (let i = 0; i < currentLayerView.componentArray.length; i++) {
                    let preSize = 0;
                    if (i <= (preLayerView.componentArray.length - 1)) {
                        preSize = preLayerView.componentArray[i].size;
                    }
                    let sizeDiff = (currentLayerView.componentArray[i].size - preSize);
                    sizeDiffArray.push(sizeDiff);

                    let convertedSizeDiff = '';
                    if (sizeDiff > 0) {
                        convertedSizeDiff = ('+' + currentLayerView.componentArray[i].convertUnit(sizeDiff));
                    } else if (sizeDiff === 0) {
                        convertedSizeDiff = ('±' + currentLayerView.componentArray[i].convertUnit(sizeDiff));
                    } else {
                        convertedSizeDiff = currentLayerView.componentArray[i].convertUnit(sizeDiff);
                    }

                    let currentBuildTime = (currentLayerView.componentArray[i].buildTime != 'CACHED') ? parseFloat(currentLayerView.componentArray[i].buildTime) : 0;
                    let preBuildTime = 0;
                    if (i <= (preLayerView.componentArray.length - 1)) {
                        preBuildTime = (preLayerView.componentArray[i].buildTime != 'CACHED') ? parseFloat(preLayerView.componentArray[i].buildTime) : 0;
                    }
                    // 小数点以下は第二位まで求める        
                    let tmpBuildTimeDiff = Math.round((currentBuildTime - preBuildTime) * 100) / 100;
                    buildTimeDiffArray.push(tmpBuildTimeDiff);

                    let buildTimeDiff = '';
                    if (tmpBuildTimeDiff > 0) {
                        buildTimeDiff = ('+' + tmpBuildTimeDiff + 's');
                    } else if (tmpBuildTimeDiff === 0) {
                        buildTimeDiff = ('±' + tmpBuildTimeDiff + 's');
                    } else {
                        buildTimeDiff = (tmpBuildTimeDiff + 's');
                    }

                    currentLayerView.componentArray[i].sizeRectangle.info = convertedSizeDiff;
                    currentLayerView.componentArray[i].buildTimeRectangle.info = buildTimeDiff;
                }

                // トータルの差分を取得
                let totalSizeDiff = 0;
                sizeDiffArray.forEach(sizeDiff => {
                    totalSizeDiff += sizeDiff;
                });
                let convertedTotalSizeDiff = '';
                if (totalSizeDiff > 0) {
                    convertedTotalSizeDiff = ('+' + currentLayerView.totalComponent.convertUnit(totalSizeDiff));
                } else if (totalSizeDiff === 0) {
                    convertedTotalSizeDiff = ('±' + currentLayerView.totalComponent.convertUnit(totalSizeDiff));
                } else {
                    convertedTotalSizeDiff = currentLayerView.totalComponent.convertUnit(totalSizeDiff);
                }
                currentLayerView.totalComponent.sizeRectangle.info = convertedTotalSizeDiff;

                let tmpTotalBuildTimeDiff = 0;
                buildTimeDiffArray.forEach(buildTimeDiff => {
                    tmpTotalBuildTimeDiff += buildTimeDiff;
                });
                // 小数点以下は第二位まで求める        
                tmpTotalBuildTimeDiff = Math.round(tmpTotalBuildTimeDiff * 100) / 100;
                let totalBuildTimeDiff = '';
                if (tmpTotalBuildTimeDiff > 0) {
                    totalBuildTimeDiff = ('+' + tmpTotalBuildTimeDiff + 's');
                } else if (tmpTotalBuildTimeDiff === 0) {
                    totalBuildTimeDiff = ('±' + tmpTotalBuildTimeDiff + 's');
                } else {
                    totalBuildTimeDiff = (tmpTotalBuildTimeDiff + 's');
                }
                currentLayerView.totalComponent.buildTimeRectangle.info = totalBuildTimeDiff;

                // 各レイヤーの差分グラフを作成
                let sizeX = 145 + 50 * scale; // 棒グラフのx座標を指定(必要に応じて調整)
                let buildTimeX = (145 + 100 * scale + 110) + 50 * scale;

                // 最大値を基準とする
                let sizeDiffAbsMax = sizeDiffArray.reduce(function (a, b) {
                    return Math.max(Math.abs(a), Math.abs(b));
                });
                sizeDiffAbsMax = (Math.abs(totalSizeDiff) >= sizeDiffAbsMax) ? Math.abs(totalSizeDiff) : sizeDiffAbsMax;
                let buildTimeDiffAbsMax = buildTimeDiffArray.reduce(function (a, b) {
                    return Math.max(Math.abs(a), Math.abs(b));
                });
                buildTimeDiffAbsMax = (Math.abs(tmpTotalBuildTimeDiff) >= buildTimeDiffAbsMax) ? Math.abs(tmpTotalBuildTimeDiff) : buildTimeDiffAbsMax;

                for (let i = 0; i < currentLayerView.componentArray.length; i++) {
                    let y = currentLayerView.componentArray[i].sizeRectangle.y;
                    let sizeWidth = (sizeDiffAbsMax !== 0) ? (sizeDiffArray[i] / sizeDiffAbsMax) * 50 * scale : 0;
                    let buildTimeWidth = (buildTimeDiffAbsMax !== 0) ? (buildTimeDiffArray[i] / buildTimeDiffAbsMax) * 50 * scale : 0;
                    let height = currentLayerView.componentArray[i].sizeRectangle.height;
                    let sizeDiffRectangle = new Rectangle(sizeX, y, sizeWidth, height, '');
                    let buildTimeDiffRectangle = new Rectangle(buildTimeX, y, buildTimeWidth, height, '');
                    sizeDiffRectangle.color = (sizeWidth >= 0) ? 'darkred' : 'darkgreen';
                    buildTimeDiffRectangle.color = (buildTimeWidth >= 0) ? 'darkred' : 'darkgreen';
                    currentLayerView.componentArray[i].sizeDiffRectangle = sizeDiffRectangle;
                    currentLayerView.componentArray[i].buildTimeDiffRectangle = buildTimeDiffRectangle;
                }

                // トータルの差分グラフを作成
                const y = currentLayerView.totalComponent.sizeRectangle.y;
                const height = currentLayerView.totalComponent.sizeRectangle.height;

                sizeX = (currentLayerView.totalComponent.sizeRectangle.x + 50 * scale);
                let sizeWidth = (sizeDiffAbsMax !== 0) ? (totalSizeDiff / sizeDiffAbsMax) * 50 * scale : 0;
                const totalSizeDiffRectangle = new Rectangle(sizeX, y, sizeWidth, height, '');
                totalSizeDiffRectangle.color = (totalSizeDiff >= 0) ? 'darkred' : 'darkgreen';
                currentLayerView.totalComponent.sizeDiffRectangle = totalSizeDiffRectangle;

                buildTimeX = (currentLayerView.totalComponent.buildTimeRectangle.x + 50 * scale);
                let buildTimeWidth = (buildTimeDiffAbsMax !== 0) ? (tmpTotalBuildTimeDiff / buildTimeDiffAbsMax) * 50 * scale : 0;
                const totalBuildTimeDiffRectangle = new Rectangle(buildTimeX, y, buildTimeWidth, height, '');
                totalBuildTimeDiffRectangle.color = (tmpTotalBuildTimeDiff >= 0) ? 'darkred' : 'darkgreen';
                currentLayerView.totalComponent.buildTimeDiffRectangle = totalBuildTimeDiffRectangle;
            }
        }
    }

    // レイヤービューの棒グラフカラーを更新する関数
    changeRectangleColor(startLayerArrayIndex: number, endLayerArrayIndex: number, flag: boolean) {
        for (let i = startLayerArrayIndex; i <= endLayerArrayIndex; i++) {
            if (flag) {
                this.layerView.componentArray[i].rebuildFlag = true;
            } else {
                this.layerView.componentArray[i].rebuildFlag = false;
            }
        }
        this.layerView.setComponentsScript();
        this.layerView.setCanvasScript(false);
        this.layerView.setHtml();
    }

    // layerViewComponentの行番号を更新する関数
    changeLineNum(pivot: number, incDec: number) {
        this.layerView.componentArray.forEach(component => {
            if (component.lineNum >= pivot) {
                component.lineNum = component.lineNum + incDec;
            }
        });
    }

}