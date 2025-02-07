export class Layer {
    // プロパティ
    code : string;
    size : string;
    buildTime : string;
    fileDirArray : string[];

    // コンストラクタ
    constructor(code: string, size: string, buildTime: string) {
        this.code = code;
        this.size = size;
        this.buildTime = buildTime;
        this.fileDirArray = new Array();
    }
}