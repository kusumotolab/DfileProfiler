export class Rectangle {
    // プロパティ
    x: number;
    y: number;
    width: number;
    height: number;
    info: string;
    color: string;
    defColor = 'lightblue'; // 棒グラフのデフォルトカラーを指定(必要に応じて調整)

    // コンストラクタ
    constructor(x: number, y: number, width: number, height: number, info: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.info = info;
        this.color = this.defColor;
    }
}