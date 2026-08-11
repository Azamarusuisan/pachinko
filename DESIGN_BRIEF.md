# DESIGN_BRIEF — Pachinko Physics Debug Overlay
承認: 保留（ユーザー確認待ち） / 2026-08-10 / 版: draft-v1

## 1. 主題
- 対象: 実機校正のため、Rapier Colliderと盤面画像の位置関係を検証する既存Physics Lab画面
- 読者: 物理パラメータと盤面座標を調査する開発者。デスクトップ中心、既存モバイルdrawerも維持
- 唯一の仕事: 表示中の物体がどのCollider／Sensorと一致するかを即座に特定する
- 成功指標: ball、nail、rail、moving mechanism、各sensor roleを個別にON/OFFでき、Physics snapshotと同じTransformで重なる

## 2. 審査
- 最終判断者: ユーザー
- 過去のNG: 今回はUI装飾・新演出・複雑なゲームロジックを明示的に禁止
- 過去のOK: 既存Lab画面の高密度なデバッグ操作
- 経由するレビュー: ユーザー直接

## 3. 世界観
- 題材の固有物: 鋼球、釘、レール、センサー矩形、接触法線
- ブランド人格: 計測器。娯楽演出より測定値を優先する
- 参照: 既存Physics Lab UI — 配置・密度・ダーク基調を維持
- 反面教師: 装飾カード、発光演出、意味のないアニメーション
- 業界の型: 物理エンジンのdebug drawを踏襲し、Collider種別を線色と短いラベルで表す

## 4. トークン
### Color
--debug-ink: #F5EDF9  ball・ラベル
--debug-collider: #78A6B8  nail・rail
--debug-start: #4ADE80  START
--debug-out: #F87171  OUT
--debug-warp: #C084FC  WARP
--debug-special: #FBBF24  attacker・電チュー・その他特殊sensor

### Type
- Display: 既存Inter / Hiragino Sans / Yu Gothic UI
- Body: 既存和文sans-serif、既存サイズを維持
- Data/Caption: ui-monospace
- 和欧混植: 既存フォールバックを変更しない

### Layout
- コンセプト: 既存Lab drawerへtoggleを足し、盤面上はgeometry以外を増やさない
- 密度: 高
- ワイヤー:
  ```text
  [既存盤面 + Debug Overlay] [既存Lab panel]
                            [Collider toggles]
                            [既存metrics/calibration]
  ```

### Signature
- Physics snapshot由来のCollider輪郭とroleラベル。盤面画像とのズレそのものを見せる

### Motion
- 予算: 追加なし
- 風車等の動きは演出ではなく、Rapier transformをそのまま描画する

## 5. コピー
- トーン: 技術用語を短く表示（START、OUT、WARP、DENCHU、ATTACKER）
- 禁止語: 演出的な煽り文句
- 確定原稿: 上記role名

## 6. 禁止事項
- 新しい装飾、グラデーション、カード、演出アニメーションを追加しない
- Pixi側で独自の風車角度を生成しない
- Debug用geometryに盤面JSONとは別の座標定数を持たせない

## 7. 技術制約
- スタック: React / PixiJS / Rapier 2D。既存デザインシステムを維持
- 対応幅: 320px以上。既存drawer動作を維持
- a11y: toggleはlabel付きcheckbox、色だけでなくroleラベルを併用、既存reduced-motionを維持

## 改訂履歴
- draft-v1 2026-08-10 既存UI維持・計測専用Overlay案
