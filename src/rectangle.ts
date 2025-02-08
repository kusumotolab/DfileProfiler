export class Rectangle {

    x: number;
    y: number;
    width: number;
    height: number;
    info: string;
    color: string;
    defColor = 'lightblue'; // 棒グラフのデフォルトカラーを指定

    constructor(x: number, y: number, width: number, height: number, info: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.info = info;
        this.color = this.defColor;
    }

}