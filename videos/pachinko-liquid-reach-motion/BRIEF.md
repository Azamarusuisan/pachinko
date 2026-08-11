---
workflow: motion-graphics
flow: automation
storyboard: no
message: "盤面奥の液晶で、リーチの期待がPUSH直前まで段階的に高まる"
destination: embedded pachinko LCD
aspect: "16:9"
language: ja
audience: private local pachinko simulation
length: 8.5s
---

## Intent

物理盤面より奥にある液晶素材。通常の盤面を覆わず、リーチ成立後に暗い待機状態から赤熱、金の収束、PUSH直前の静止へ滑らかに高める。再開後は当たり時だけ虹色の解放へ進む。

## Assets

外部キャラクター、メーカーのロゴ、実機画像は使わない。コードで作るオリジナルの幾何学・光・日本語タイポグラフィのみ。

## Customizations

- 640×360、8.5秒、30fps
- 「激熱」は短く立体的に出すが、常時表示しない
- シアンは待機、赤は期待上昇、金はPUSH直前、虹は当たり後だけ
- 盤面側の図柄・PUSH UIが前景に乗るため、中央の可読領域を空ける
- フラッシュは強くしても、白一色の長時間点滅は避ける

## Notes

ユーザー指定: 動画は盤面の裏側に自然に埋め込み、前面を覆わない。PUSHはユーザーが押す。

承認済み統合契約: frame 139（4.633秒）でPUSH待ち、当たり時はframe 140（4.667秒）から再開し、8.5秒で完結する。
