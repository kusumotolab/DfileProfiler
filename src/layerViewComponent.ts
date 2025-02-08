import { Rectangle } from "./rectangle";

export class LayerViewComponent {

    index: number;
    instruction: string;
    lineNum: number; // 対応するDfile行の先頭番号
    size: number;
    convertedSize: string;
    buildTime: string;
    sizeRectangle: Rectangle;
    buildTimeRectangle: Rectangle;
    sizeDiffRectangle: Rectangle | undefined;
    buildTimeDiffRectangle: Rectangle | undefined;
    isRebuild: boolean; // ビルドキャッシュが効かなくなるか判定するフラグ
    decoration: any; // 対応するDfile行のハイライト情報
    isDecorated: boolean; // 対応するDfile行がハイライト中か判定するフラグ

    constructor(index: number, instruction: string, lineNum: number, size: number, buildTime: string, sizeRectangle: Rectangle, buildTimeRectangle: Rectangle) {
        this.index = index;
        this.instruction = instruction;
        this.lineNum = lineNum;
        this.size = size;
        this.convertedSize = this.convertUnit(this.size);
        this.buildTime = buildTime;
        this.sizeRectangle = sizeRectangle;
        this.buildTimeRectangle = buildTimeRectangle;
        this.isRebuild = false;
        this.isDecorated = false;
    }

    // サイズの単位変換を行うメソッド
    convertUnit(size: number): string {
        const kb = 1000;
        const mb = Math.pow(kb, 2);
        const gb = Math.pow(kb, 3);

        let target = null;
        let unit = 'B';
        // 絶対値で単位を決定
        const absSize = Math.abs(size);

        if (absSize >= gb) {
            target = gb;
            unit = 'GB';
        } else if (absSize >= mb) {
            target = mb;
            unit = 'MB';
        } else if (absSize >= kb) {
            target = kb;
            unit = 'KB';
        }

        // 小数点以下は第二位まで求める
        const tmpResult = target !== null ? Math.round((absSize / target) * 100) / 100 : absSize;
        // 元の符号を付けて戻す
        const result = size < 0 ? -tmpResult : tmpResult;
        return (result + unit);
    }
    
}