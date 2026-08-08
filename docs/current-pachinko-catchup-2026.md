# 現行パチンコ機種キャッチアップ台帳

基準日: 2026-08-08

## 「現行」の定義

単年度の新台一覧だけを現行機種とはしない。次の状態を別々に記録する。

- `ANNOUNCED`: メーカー発表済み、未導入を含む
- `INTRODUCED`: 導入日を迎えた
- `INSTALLED`: 公開ホールデータで設置を確認できる
- `VALIDATED_TYPE`: 公安委員会の型式検定公示を確認できる
- `LEGACY_ACTIVE`: 導入から年数が経過しても多数設置される
- `UNKNOWN`: 情報源間の突合が未完了

検定の有効期間は公示から3年の公示例があるが、認定、部品供給、設置状況などを含む
実際の稼働状態は単純に導入年だけでは判定しない。

## 母集団と情報源

1. 日本遊技機工業組合「新機種情報（パチンコ・スマパチ）」
   - 24ページ構成
   - 最新ページはメーカーと製品公式サイトを対応付ける
   - 動的ページングのため取得不能ページを「存在しない」と扱わない
2. 日工組組合員一覧
   - パチンコ関連メーカー/ブランドを網羅するメーカー母集団
3. 都道府県公安委員会の型式検定公示
   - 型式名、製造業者、検定番号、公示日を確認する一次資料
4. メーカー公式製品ページ/プレスリリース
   - 確率、賞球、RUSH、ST、LT、筐体、スマパチ/P機を確認
5. P-WORLD
   - 新台月次、設置店舗、現時点の市場残存を確認する補助資料
   - ランキング数値の転載は行わず、設計上の傾向だけを利用する
6. DK-SIS公開資料
   - 全国遊技台の大規模サンプルによる市場構成の補助資料

## 2026年導入カレンダー

P-WORLD月次ページで1月から8月までを確認した。各月ページはパチンコとパチスロの
合算件数も含むため、機種Catalogへ取り込む際は `category=PACHINKO` で分離する。

- 1月: `introduce_calendar.cgi?year_month=2026-01`
- 2月: `introduce_calendar.cgi?year_month=2026-02`
- 3月: `introduce_calendar.cgi?year_month=2026-03`
- 4月: `introduce_calendar.cgi?year_month=2026-04`
- 5月: `introduce_calendar.cgi?year_month=2026-05`
- 6月: `introduce_calendar.cgi?year_month=2026-06`
- 7月: `introduce_calendar.cgi?year_month=2026-07`
- 8月: `introduce_calendar.cgi?year_month=2026-08`

2026年だけでも、P/e、甘デジ、ライト、ミドル、超高分母表記、ドラム、羽根物、
設定付き、LT、チャージ/C時短合算など多様な表記が存在する。表示上の「大当り確率」
だけを同じ意味の値として正規化してはいけない。

## 2026年に確認した主要分類

### 筐体/球管理

- `P`: 物理球を上皿等で扱う従来型
- `e`: スマパチ。持ち球を電磁的に記録・表示する
- 同一コンテンツでP版/e版の双方を出す例がある

### 確率帯

- 羽根物/物理役物中心
- 約1/79–1/99の甘デジ
- 約1/100–1/129
- 約1/150–1/199のライトミドル
- 約1/200–1/299
- 約1/319
- 約1/349–1/399
- チャージ、C時短、小当り等を含む合算表記
- 約1/999等、入口事象の意味が通常の図柄揃い確率と異なる表記

### ゲームロジック

- 確変ループ
- ST
- 時短
- 一種二種混合/RUSH
- 転落
- LT / LT2.0 / LT3.0+系
- 残保留
- 普図抽選/電チュー
- 大当りとチャージ/C時短の合算
- 設定付き

これらは物理エンジンへ混ぜず、`machine-spec` と将来の `game-logic` に置く。

## 物理ゲージの分類

全機種を一枚の「日本パチンコ風盤面」で代表させない。

### A. 大型中央液晶・左通常ルート型

- 通常時は左打ち
- 天釘から左外周、寄り、風車、道釘、袴、命釘、ヘソ
- 大当り/RUSHでは右打ち
- 右側にスルー、電チュー、アタッカー、右OUT
- エヴァ15系を研究する本プロトタイプはこの分類

### B. 海物語系ステージ/ワープ型

- 現行設置で非常に重要な独立分類
- 左側ワープ入口、ステージ、ヘソへのステージ落下
- 比較的盤面全体が見え、液晶周辺のゲージがAと異なる
- Aの釘配置を色替えして代用しない

### C. スマパチ大型役物/LT型

- e機
- 大型センター役物、右打ち専用流路の比重が高い
- 持ち球UIはデジタル表示
- 物理球は盤内循環でも、釘・レール・入賞口の物理は必要

### D. 羽根物/物理役物型

- デジパチと別エンジン要件
- 羽根開閉、拾球、役物内振り分け、V入賞が中心
- 釘だけでなく時間依存Mechanismの精度が支配的

### E. ドラム/クラシック/小型中央役物型

- 中央液晶が巨大とは限らない
- 盤面上の釘領域が広い
- 大型液晶型の中央Colliderを流用しない

### F. 特殊入口/デカスタート/まわるん/超ワープ型

- 通常のヘソ入口幅やワープ構成とは異なる製品上の特徴を持つ
- 製品名だけで物理寸法を推定せず、個別盤面を測定する

## 現在も重要な旧導入機

「P新世紀エヴァンゲリオン15 未来への咆哮」は2026年7月時点でもP-WORLDで
5,000店超の設置情報があり、2026-08-08設置台数ランキングでも最上位にある。
したがって、2026年新台だけでなく `LEGACY_ACTIVE` の代表として調査対象に残す。

同時に、海物語系の複数世代・甘デジ版が設置上位に多数存在する。エヴァ型一枚だけを
「現在の日本のパチンコ」として設計するのは不適切である。

## Machine Catalog Schema案

```ts
interface MachineCatalogEntry {
  id: string;
  displayName: string;
  typeName?: string;
  manufacturer: string;
  brand?: string;
  cabinet: "P" | "E_SMART";
  status: Array<"ANNOUNCED" | "INTRODUCED" | "INSTALLED" | "VALIDATED_TYPE" | "LEGACY_ACTIVE" | "UNKNOWN">;
  introducedOn?: string;
  validationNumber?: string;
  validationPublishedOn?: string;
  probabilitySemantics: "FIGURE_JACKPOT" | "COMBINED" | "CHARGE_COMBINED" | "PHYSICAL_ROLE" | "UNKNOWN";
  normalProbability?: number;
  gaugeFamily: "LARGE_CENTER_LEFT_RIGHT" | "SEA_STAGE_WARP" | "SMART_LT" | "HANEMONO" | "DRUM_CLASSIC" | "SPECIAL_ENTRY" | "UNKNOWN";
  normalRoute: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  rushRoute: "LEFT" | "RIGHT" | "BOTH" | "NONE" | "UNKNOWN";
  features: string[];
  sources: Array<{ kind: "OFFICIAL" | "VALIDATION" | "INSTALLATION" | "SECONDARY"; url: string; checkedAt: string }>;
}
```

## 本プロジェクトへの即時ルール

- 「route-right統計」があるだけでは右打ち実装と呼ばない
- 右打ちは同一Launcherの強いハンドル入力で上部を越え、右ゲージへ入る
- 右ゲージには専用釘、スルー、電チュー、アタッカー、右OUTが必要
- 盤面の主要な分岐は釘、レール、役物Colliderから生じさせる
- 大型液晶の上へ水平面を作らず、天釘/鎧釘で左右へ流す
- 機種CatalogとBoard JSONを分離し、同一ゲームロジックでも異なるゲージを許容する
- A–Fの各ゲージFamilyに別Goldenを持たせる

## 未完了として明示する項目

- 日工組24ページ全項目の機械可読取得
- 全都道府県の検定公示の重複排除
- P-WORLD全設置機種の利用規約に沿った機械取得
- 各機種の正確な釘座標/レール曲率
- メーカー非公開のゲージ表、発射初速、材質別接触係数

上記は未確認値を推測で埋めず、Catalog上で `UNKNOWN` とする。
