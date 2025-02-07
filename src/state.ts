import { LayerView } from "./layerView";

export class State {
    // プロパティ
    layerView: LayerView;

    // コンストラクタ
    constructor(layerView:LayerView) {
        this.layerView = layerView;
    }
}