export class Layer {

    code: string;
    size: string;
    buildTime: string;
    fileDirArray: string[]; // 依存している外部ファイル・ディレクトリ

    constructor(code: string, size: string, buildTime: string) {
        this.code = code;
        this.size = size;
        this.buildTime = buildTime;
        this.fileDirArray = new Array();
    }
    
}