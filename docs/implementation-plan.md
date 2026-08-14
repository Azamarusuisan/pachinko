# パチンコ・シミュレーター実行計画

更新日: 2026-08-11

対象: このリポジトリ

参考実装: `https://github.com/SHOGO391/nojiru.git` @ `bbefab094522f17c85342f2fe4822f7e881292eb`

この文書を実装順の正本とする。目的は見た目だけを増やすことではなく、次の4点を順番に成立させることにある。

1. 同じ条件なら同じ結果を再現できる。
2. 数値計算の刻みを細かくしても結果が収束する。
3. 実機の観測データと比較して誤差を説明できる。
4. 抽選結果、映像、文字、光、音、PUSHが一つの決定論的タイムラインで同期する。

## 0. 現在地 — 確認済み事実

### 基盤

- `lint`、`typecheck`、`build`は成功済み。全`npm test`は27 files / 151 tests、focused CLIは4 files / 48 testsが成功し、`npm run verify:assets:release`も3/3 assetsで成功した。ブラウザは専用Hermesの500×375背面contextだけ許可され、全Playwright projectは未実施。
- Coordinate Transform、Debug Overlay、Physics Config、共通Launcher Config、Metrics、Heatmap、固定seed Experiment、Warp schema/runtime、Moving Object同期、Joint Playgroundは既にある。作り直さず、不足だけ直す。
- 現在の盤面は未コミットの `2.5.1-visible-continuous-gauge`、物理バージョンは `phase1-rapier-0.19.3-v5`。基準画像・実測座標による校正はまだない。

### 物理

- seed `123456`、1,000球、power `0.68`、240 Hz、16 substepsでは、START 43.7%、OUT 32.2%、other 24.1%、timeout 0、remaining bodies 0、最大速度3.536 m/sだった。
- 同じ1,000球を16→32 substepsで比較すると、STARTは43.7→42.1%（-1.6 pp）、OUTは32.2→30.9%（-1.3 pp）、平均衝突数は24.069→22.349（-7.15%）になった。
- 現在の収束基準はSTART/OUT差0.3 pp以内、平均値差2%以内であり、上記結果は不合格。したがって43.7%を実機相当の値として扱わない。
- 同seed 10,000球でもOUTは32.72→29.89%（-2.83 pp）、平均衝突数は-7.603%で、P1は未解決。外側Hz×substepsが同じ有効刻みなら結果は一致するためrunner/fire scheduleではなく、grazing bounce時の微小な分離・再接触が刻みに依存して下流で増幅することまで確認した。
- power `0.68`では確認した5 seedの全球が最初に左ルートへ入り、右ルート・風車接触は0だった。power `1.0`では100球中92%が右ルートへ実際に到達したため、右ルート自体が完全に閉じているわけではない。
- `firstRoute`にはセンサー未通過時の最終位置fallbackが含まれる。校正には`routeExposure`と実センサー件数を使う。
- 有効釘は120本中67本。`field`は22本中3本、`heso`は4本中0本、`heso-guide`は3本中0本、`lower`は13本中2本だけが物理Colliderである。これが正しい実機配置である証拠はまだない。

### 抽選・映像

- 当落は演出開始前に固定される。PUSHは当落を変更せず、FREEZEから既定結果へ進めるだけである。
- リーチは左右同図柄停止、中央だけ変動する契約になっている。
- 現在の仮仕様は大当たり約1/319。固定seed 100万抽選では全リーチ率7.02%、大当たり率0.317%。青・緑・赤・虹の期待度順は成立するが、商品仕様・実機値として未承認。
- 動画はLCD内かつ物理盤面の後ろにあり、図柄・文字・PUSHと同じLottery Timelineを参照する。8.5秒/30 fps動画はframe 139でFREEZEし、手動PUSH後の大当たりだけframe 140から再開する。`StorySequence`は同じclockを`storyPlaybackPlanAt`へ渡してseekする。
- Smoothness Harnessは総合`report.pass`、動画drop、AV skew、semantic timing、long taskを計測する。500×375 Hermes runでmiss/jackpot両方の合格実績はあるが、cold jackpotの366.7 ms gap/2 dropsと別missの58.2 ms semantic skewも観測したため、統合smoothness gateはまだ不安定で未合格とする。
- 盤面筐体、story poster、8.5秒MP4はprovenance/licenseとSHA-256をmanifestへ記録済み。`npm run verify:assets:release`は3 files / 3 static references / 3 distributable assetsで成功した。
- 参考画像100件は取得済みだが、構造化された演出観察データは0件。

### 音響とNojiru

- Nojiruはcleanかつ最新で、基準は `SHOGO391/nojiru` commit `bbefab094522f17c85342f2fe4822f7e881292eb` の実装そのもの。
- Nojiru `audio-lab`には109 SEと12 BGM、合計121生成ファイルがあるが、SHA-256で104種類。実機録音ではなく比較用の合成音である。
- Nojiru `play-kit`の音は50 msの汎用`click/win/lose/tick/cashout`。AudioContext遅延初期化、mute保存、失敗時fallbackは参考にできるが、日本のパチンコ音の正解データではない。
- Nojiruの「8段階報酬文法」は、同リポジトリ自身が未検証仮説としている。A/Bテスト候補には使うが、科学的事実として採用しない。
- 現在の音響資料はNojiru 121音＋ローカル3音で名目124、重複排除後107波形。500 ms窓は489行・457 unique key。100,000 unique窓目標に対して0.457%、残り99,543窓。
- 日本の実機録音0件、オンラインカジノ実録0件。したがって現在の分析から「実機相当」とは結論できない。
- Nojiruから再利用する根拠はseeded DSP (`packages/audio-lab/src/dsp.ts:18-21,83-88`)、半音→Hz (`packages/audio-lab/src/se.ts:34-35`)、WAV/manifest生成 (`tools/assetgen/src/audio.ts:59-115`)、決定論/catalog gate (`packages/audio-lab/tests/audio.test.ts:62-71,140-175`)。生成音そのものを実機正解とは扱わない。
- ランタイム13 cueは実`PlayAudio`から48 kHz PCMへ2回ずつrenderし、共通AudioContext clock、AudioRegistryのpriority/cooldown/voice上限、決定論hash・pitch・帯域・crest・sample peak、1,000衝突stressとnode解放まで確認済み。標準true peakと実機校正はA3に残る。

## 1. 実行順

```text
B0 基準固定
 ├─→ P1 数値収束 → P2 実機観測 → P3 物理校正 ─┐
 ├─→ A1 音響データ健全化 → A2 PCM測定 → A3 実音校正 ─┤
 └─→ V1 抽選契約 → V2 同期 → V3 演出縦切り ───────┤
                                                        ↓
                                              I1 統合・最終検証
```

P1を通る前にSTART率を狙って釘・重力・反発を調整しない。V3を通る前に演出を大量生産しない。A1の500件pilotを通る前に100,000件収集を始めない。

## B0 — 基準固定と証拠境界

### B0.1 再現情報を固定する

- baseline report自身を除くpachinko source snapshot、board raw hash、board geometry hash、physics config hash、package-lock hash、Nojiru commitを一つのbaseline reportへ記録する。
- 現在のGoldenは「回帰検知用」であり「実機校正値」ではないと明記する。
- `simulation-results.md`と`phase1-status.md`の古いv2.3/35 test記述を現状へ直す。
- ユーザーの変更を勝手にresetしない。commit/pushは別途明示された場合だけ行う。

### B0.2 素材と研究データを分離する

- 出自不明のローカルMP3は`public`配下から研究専用・gitignored領域へ移し、build成果物へ入れない。
- story poster/MP4は自作HyperFrames素材へ交換済みで、source/render hashと利用条件をrelease manifestで検証する。
- Nojiruの生成音は`generated-reference`として扱い、production assetへコピーしない。
- 音響データに`datasetRole`（`real-calibration` / `generated-reference` / `generic-dsp` / `research-only`）、source、rights、SHA-256を必須化する。

### B0 合格条件

- 同じbaseline reportからboard/config/package/Nojiru hashを再計算できる。
- `npm run verify:assets:release`が成功し、未確認ランタイム素材が0件。
- `lint`、`typecheck`、unit、buildが成功。
- この時点では物理値・音・演出の良し悪しを変更しない。

## P1 — 数値物理の収束

これは最優先のcritical pathである。

### P1.1 差が最初に生じる接触を特定する

- seed-set-v1を `[1, 7, 21, 123456, 987654321]` として固定する。
- 16/32 substepsの同一ball id traceは実装済み。ball-1はlauncher releaseまで一致し、center-displayのgrazing接触で再接触数が分かれた後、`n117`再接触の有無によってSTART/OUTへ分岐した。
- この再現例では`n019`と球同士衝突は原因から除外済み。全体ではcenter-display↔outer-playfieldが最頻の最初のevent差である。
- `firstRoute` fallbackは診断値から外し、実センサー通過とroute exposureだけを比較する。

### P1.2 最小ケースで原因を直す

- 問題の接触だけを持つstraight-capsule micro-board testは追加済み。最初の接触は局所収束する一方、後続のgrazing再接触回数が16/32で分かれる。
- 一度に変更するのは、geometry、contact material、solver/event処理のいずれか1変数だけとする。
- max velocity clampで差を隠さない。異常加速が観測された場合だけ、clamp回数をmetricsに残した上で安全策を使う。
- 風車や演出はこの修正に混ぜない。

### P1 合格条件

- seed-set-v1の各seed、1,000球、16→32 substepsで次をすべて満たす。
  - START差とOUT差が各0.3 pp以内。
  - 平均滞在時間、平均衝突数、平均速度の差が各2%以内。
  - finite=true、timeout率<0.01%、remaining bodies=0、velocity clamp=0。
- micro-boardの同一接触について、16/32の接触順が一致し、離脱速度差が0.05 m/s未満。
- 100球はsmoke、1,000球は収束判定に使う。100球だけで合否を決めない。
- 合格するまでGoldenを更新しない。

## P2 — 実機観測データの取得

数値収束後に、一機種・一ゲージへ対象を限定する。対象機種が決まらない限り、実機校正は開始しない。

現状: 権利と撮影条件を満たす240 fps以上の実機動画0件、ObservedCapture 0件、孤立衝突0件、terminal付き軌跡0件。TRAIN/HOLDOUT schemaと独立session/hash検証は実装済みだが、HOLDOUT評価は未実施。

### P2.1 盤面座標

- 正面補正できる高解像度写真、11 mm球または実測スケール、盤面傾斜、ガラス間隔を記録する。
- 釘中心・釘頭径、rail、START、OUT、WARP、風車軸、各sensor境界をmmへ変換する。
- 既存の共通Transformだけを使い、画像用とCollider用の座標変換を増やさない。
- LCD clipも`center-display-collider`から生成し、固定CSS九角形を廃止する。

### P2.2 動画観測

- 240 fps以上で完全な球軌跡、rail出口、route、滞在時間、START/OUTを記録する。
- 釘・railの孤立衝突は可能なら1,000 fps以上で、入射/反射角、直前/直後速度、spinを測る。
- 風車は入射条件と角速度応答を記録する。
- capture session単位でTRAIN/HOLDOUTを先に分割し、同一動画の隣接frameを両方へ入れない。

### P2.3 必要量

- pilot: 完全軌跡100球、釘衝突100件、rail衝突100件。ここで検出・座標誤差を確認する。
- nominal powerのSTART/OUT率: 最悪条件でも95%区間の半幅を約2 ppにするため、完全terminal 2,401球以上。
- power sweepはpilot結果から実際に使う範囲だけを選び、各点を固定seed simulationと同じ入力条件へ対応づける。

### P2 合格条件

- 座標再投影誤差がmedian 0.5 mm以下、p95 1 mm以下。
- 全観測に機種、盤面状態、fps、scale、session、rights、TRAIN/HOLDOUT、欠測理由がある。
- HOLDOUTは校正完了まで見ない。
- データが不足する場合は「実機未校正」の表示を維持し、推測値で穴埋めしない。

## P3 — 物理パラメータ校正

既存のCalibration LayerとExperiment/Heatmapを使い、次の順で1群ずつ合わせる。

現状: 実機ObservedCaptureが0件のため未着手。推測値でTRAINまたはHOLDOUT結果を作らない。

1. launcher: rail出口位置、速度、角度、分散。
2. isolated contact: ball/nail/railのrestitution・friction。
3. flight: gravity、damping、spin影響。
4. moving object: 風車の質量・慣性・摩擦・同期。
5. aggregate: trajectory、route、heatmap、滞在時間、衝突頻度。
6. terminal: START/OUT/other。

START率だけをlossにしない。釘位置をSTART率へ合わせて動かすのは、測定座標の誤差範囲内に限る。

### P3 合格条件

- TRAINで調整後、未使用HOLDOUTで以下のproject gateを満たす。
  - 反射角MAE 5°以下。
  - trajectory MAE 11 mm以下。
  - START/OUT差 各2 pp以下。
  - heatmap Jensen-Shannon divergence 0.05以下。
- 既存の2D/3D decision gateを実測Z方向データで評価する。失敗した場合だけ3D移行を計画し、先に3D化しない。
- power×seed matrixの全条件でtimeout<0.01%、remaining bodies=0、clamp=0。
- 最後にのみGoldenを更新し、旧/新結果、config hash、board hash、理由を残す。

## A1 — 音響データ基盤の修正

P1と並行できるが、B0.2完了後に行う。

現状: target/domain/event/hash/local file、generated-reference revision、source-hash split、層化抽出、未達時exit 2とそのテストは実装済み。analyzer/config/ffmpeg/manifest/pachinko commitを単一reportへ束ねる作業は残る。

### A1.1 現在の検証漏れを直す

- `corpus:validate`へmanifestを明示し、target件数、domain、event label、rights、hash、local file存在を検証する。未達なら非0終了する。
- 現在の489窓を100,000件完了として扱わない。
- splitはwindow idではなくsource SHA-256単位にし、同じ波形や同一原音がTRAIN/validation/HOLDOUTを跨がないようにする。
- manifest先頭からの単純切り詰めをやめ、domain/event/sourceごとの層化を行う。
- レポートにanalyzer version、config hash、ffmpeg version、manifest hash、pachinko/Nojiru commitを記録する。

### A1 合格条件

- cross-split同一hash 0件。
- target未達時にvalidatorが失敗するテストがある。
- 489 raw rows / 457 unique windows / 100,000 targetという進捗が再計算できる。
- generic音をpachinko実音として数えない。

## A2 — ランタイム13 cueのPCM測定

現状: A2.1の共通AudioContext clock、AudioRegistry admission、13/13 offline PCM report、高密度stress、node解放、確定音漏洩契約まで実装・確認済み。4x Catmull-Rom値は標準true peakではなくscreening proxyであり、実機校正後のceiling決定はA3へ残す。

### A2.1 共通音声クロック

- 通常プレイ、演出Harness、テストで同じAudioContext schedulerとseedを使う。
- `storyLaunch`の`setTimeout`をAudioContext時刻基準へ寄せる。
- 既存のAudioRegistryを使い、釘音、発射音、入賞音、予告音へpriority、cooldown、最大同時voice数を設定する。新しい音響基盤は作らない。

確認結果: 13 cueすべてが同じAudioContext時刻へscheduleされる。global 24 voice、cue別priority/cooldown/maxConcurrencyを適用し、`storyLaunch`を含むランタイム音声にwall-clock `setTimeout`は残っていない。

### A2.2 測定

- 13 cueすべてを48 kHz PCMへoffline renderし、duration、attack、F0/note/cents、帯域比、crest、sample peakを記録する。
- pitched cueとnoise cueを分ける。`カシュ`と釘音に無理な音階を付けず、キュイン・確定音だけ音高列を検証する。
- sharpnessとtrue peakは、実装した計算が標準量として妥当性確認できるまで「proxy」と明記する。
- Nojiru 104 unique波形は同じanalyzerへ通し、実機正解ではなくgenerated controlとして比較する。

確認結果: 1,000 nail callsを同一clockへ投入し、peak voice 1/8、cooldown reject 999、render後voice/node 0/0、sample peak 0.008244、clip 0、4x cubic proxy 0.008282。stress hashは2回一致し、全reportも2回byte一致した。

### A2 合格条件

- 13/13 cueのPCM reportがあり、同seedでhashが一致。
- noise cueは誤ったF0を必須にしない。
- デジタル安全上のtrue peak ceilingを校正後に決め、stress再生でclip 0。
- 釘の高密度衝突stressでvoice上限を超えず、AudioNodeが解放される。
- キュイン/確定音は大当たりまたは明示された激熱状態だけで鳴り、通常ハズレへ漏れない。

## A3 — 音響pilot、校正、100,000窓

### A3.1 500イベントpilot

- 権利を確認できる資料だけを使い、日本パチンコ150、パチスロ150、オンラインカジノ150、合成primitive 50イベントを目標にする。
- `launch`、`nail-hit`、`rail`、`start`、`hold-change`、`reach`、`freeze`、`push`、`kyuin`、`jackpot`等のevent labelを付ける。
- 実録が取得できなければ、そのdomainは0のまま報告し、合成音で埋めて「実録」と呼ばない。
- 無断ダウンロード、DRM回避、出自不明ファイルの再配布はしない。

### A3.2 比較実験

- event/tierごとにmedian/IQRを出し、loudness・true peakを揃えた上で一度に音高、attack、倍音、間の長さの1変数だけを変える。
- Nojiruの8段階、すなわちbaseline→breach→uncertainty→gradual disclosure→delay→silence/freeze→synchronized payoff→resetをA/B仮説として検証する。
- 100個の候補を作ってblind評価し、採用は上位30個まで。結果が出る前に大量のproduction音へ組み込まない。

### A3.3 100,000窓

- 500件pilotのvalidator、split、権利監査が全て通ってから開始する。
- 100,000件は「異なるファイル数」ではなく、重複しない500 ms window key数と定義する。最低13.89時間分になる。
- 全frame詳細はpilotだけに保存し、100,000件本体は要約値と必要な異常区間だけ保存する。

### A3 合格条件

- pilot 500/500にevent、domain、source、rights、hash、splitがある。
- 実録・生成・genericの集計が分離される。
- 100,000 unique window key、cross-split重複0、validator成功。
- 実機データが0なら、最終評価を「音響基盤完成・実機校正未了」とする。

## V1 — 抽選・保留・PUSH契約

演出を磨く前に意味を固定する。

- 1/319、保留色分布、各色の大当たり期待度、リーチ発展率を「商品仕様」として決め、観測値と分ける。
- START一件につき通常抽選状態を一度だけ消費する。
- FIFO最大4、5個目の扱い、RUSH中START、RUSH100発後復帰をテストする。
- 通常ハズレ、緑リーチ、赤ハズレ、赤当たり、虹当たりを固定seed fixtureにする。
- PUSH前後のresult hashが変化しないことをテストする。

### V1 合格条件

- 同seedで抽選列が完全一致。
- 青<緑<赤<虹の期待度順を仕様テストで保証。
- `REACH`表示中は必ず左右同図柄で、中央だけが運動。
- PUSHは無期限に待機し、ユーザー操作だけで進み、当落を変えない。

## V2 — 図柄、映像、音、文字の同期

現状: 共通Lottery Timeline、8.5秒動画seek、純粋timeline/smoothness testsは実装・確認済み。`test:hermes-small`は専用Hermes profileとloopback URLだけを許可し、scenarioごとに隔離500×375 contextを背面実行して破棄する。miss/jackpotは合格実績がある一方、上記の一時的なgap/skewも再現しており統合gateは未合格。

- CSS、video、audioを独立時計で進めず、既存Lottery Timelineを唯一のphase sourceにする。
- 3列へ決定論的な位相差を付け、回転帯から停止図柄へ連続減速する。停止時のDOM交換によるテレポートをなくす。
- FREEZE時刻、PUSH待機、再開時刻、miss/jackpot終端をcue sheetとして固定する。
- タブ復帰時は現在phaseへseekし直す。
- reduced-motionでも意味と当落は同一にする。

### V2 合格条件

- miss/jackpot両Harnessで`report.pass === true`をE2Eが直接検証。
- FREEZE中の動画移動1 frame以下。
- AV skew p95 50 ms以下、最大100 ms以下。
- dropped frame率0.1%以下、50 ms超frame gap 0、long task 0。
- 60 Hz環境の推定FPSがtargetの99.5%以上。
- 通常、リーチハズレ、777で意味順と停止図柄が一致。

## V3 — 「脳汁」演出の1本縦切り

最初に完成させるのは `青通常 → 赤昇格 → リーチ → FREEZE → 手動PUSH → ハズレ/777` の1系列だけとする。

### V3.1 参考画像をデータ化する

- 取得済み100画像へ、筐体層、LCD領域、文字階層、色、発光位置、図柄サイズ、期待度表示、PUSH、保留、釘との前後関係を注釈する。
- SANYO等の商用画面は構造分析だけに使い、ロゴ、キャラクター、筐体意匠を複製しない。

### V3.2 8段階を仮説として実装する

- baseline: 通常回転は情報量と音圧を抑える。
- breach: 保留色・赤文字・短い高域cueで通常から逸脱する。
- uncertainty: 左右停止と映像の間を保つ。
- gradual disclosure: 色、文字の押し出し、光、音高を段階的に増やす。
- delay: 結果直前を引き延ばす。
- silence/freeze: 音と映像を止め、PUSHをユーザーへ渡す。
- synchronized payoff: 777、文字、盤面光、キュインを同一時刻で出す。
- reset: 次回転で基準状態へ完全復帰する。

### V3.3 見た目

- LCD映像は盤面の裏、図柄・赤文字はLCD内の前、物理球・釘は最前面という層順を維持する。
- 盤面印刷、透明樹脂、金属、導光、球反射、独自ライセンス確認済みフォントを一系列分だけ作る。
- 装飾画像へ物理釘を焼き込まない。表示釘は有効Colliderからだけ描く。
- 光量は常時最大にせず、baselineとの差分と同期でピークを作る。

### V3 合格条件

- idle/chance/reach/hot/freeze/jackpotの固定6 frameを同じseedから再生成できる。
- 上塗りで釘、球、LCD境界を隠さない。
- LCD内部の有効釘0、表示釘数=有効nail Collider数。
- Debug Overlayと表示の誤差がdesktop/mobileとも1 CSS px以下。
- 使用画像、動画、フォント、音のprovenance/licenseが全てverified。
- ユーザー承認前に2本目の演出系列へ進まない。

## I1 — 実プレイ統合と最終検証

Harness直起動だけでなく、物理START→保留→抽選→リーチ→PUSH→結果→RUSH/通常復帰を通す。

### I1.1 自動検証

順番を固定する。

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run verify:assets:release`
6. Playwright全project
7. seed-set-v1の1,000球16→32 convergence
8. nominal configの100球smoke
9. nominal configの1,000球experiment
10. nominal configの10,000球experiment

ブラウザー検証は、ユーザーが許可した専用Hermes Chromeの500×375背面windowだけで行う。`test:hermes-small`以外から通常Chrome profileを開かず、スクリーンショットも必要な検証に限定する。Safari/WebKitを含む全projectは別途許可・実行条件を整えるまで未実施とする。

### I1.2 記録する値

- boardVersion、boardHash、configHash、physicsVersion、seed、balls、timestamp。
- START、OUT、other sensor、timeout、remaining bodies。
- 平均/median/p95滞在時間、平均/median/p95衝突数。
- 平均/最大速度、clamp回数、nail/rail/windmill衝突数。
- left/center/right route exposure、terminal別Heatmap、実機観測とのloss。
- frame、video、AV skew、long task、AudioNode/voice peak、audio true peak。

### I1 合格条件

- 全command成功、release未確認asset 0。
- 30分auto-fireで例外、body、DOM、AudioNodeの増殖なし。
- 10,000球でfinite=true、timeout<0.01%、remaining bodies=0、clamp=0。
- 物理収束gateとHOLDOUT calibration gateを両方通過。
- 最終報告で「確認済み事実」「仕様」「仮説」「未観測」を分ける。

## 2. 直近の実装単位

次の順に着手し、各単位のgateが通るまで次へ広げない。

1. **B0 report** — reportは生成済み。最終diff確定後にhashを再生成して確認する。
2. **P1 divergence trace** — 完了。center-display周辺のgrazing再接触から差が増幅する。
3. **P1 micro-board fix** — 根本原因を一箇所で直し、seed-set-v1の収束を通す。
4. **A1 corpus validator** — 実装済み。100,000件未達は意図どおり非0終了する。
5. **A2 13-cue render** — 実装・測定済み。実機音校正はA3に残る。
6. **V1 semantic tests** — 実装済み。保留、RUSH、PUSH、reachを固定した。
7. **P2 capture pilot** — 対象実機を決め、100球pilotを取得する。
8. **V2 sync** — 共通phase clockと小窓Hermes runnerは実装済み。cold/warm各複数回で総合Harness gateを安定して通す。
9. **P3 calibration** — TRAINで調整し、HOLDOUTで判定する。
10. **V3 vertical slice** — 1系列だけを商用品質へ近づける。
11. **I1 final** — 100/1,000/10,000球、E2E、asset、長時間stressを通す。

## 3. 今は実装しないもの

- 羽根物、クルーン、複雑な電チュー/アタッカーの完成版。
- 演出500種類、大量の大当たり動画、出玉経済システム。
- 実測Zデータなしの3D物理全面移行。
- START率だけを目標にした釘・重力・反発の調整。
- 権利・split・validator未整備のまま行う100,000件収集。
- Nojiru生成音や8段階仮説を「日本の実機で検証済み」と扱うこと。

これらはP1、P2/P3、A1/A3、V3の該当gateを通った時点で、必要性を再判定する。
