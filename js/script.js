/* ============================================================
 * Memo Pad - メインスクリプト
 *
 * [この課題で学ばせたいこと] (PDF p.8 より)
 *   localStorage で「保存 → 表示」の一連の流れを体験し、
 *   そのデメリット (セキュリティ・容量・型の不便さ) を実感することで、
 *   後続フェーズで PHP+DB が必要になる理由を理解する。
 *
 * [授業で扱う主な技術]
 *   - localStorage の API: setItem / getItem / removeItem / clear / length / key(i)
 *   - 配列 と for 文 (タンスのイメージで全件ループ、length で長さ取得)
 *   - jQuery の基本: val() / on("click") / append() / empty() / .text()
 *
 * [この課題で追加実装するもの] (PDF p.6)
 *   - 1件削除 (removeItem)        → 授業の clear() は全削除のみ
 *   - 1件更新                       → 登録内容を上書き
 *   - Style とレイアウト           → CSS でダークテーマ化
 *   - 検索フィルタ / 作成日時表示  → 自分の工夫として追加
 *
 * [作る順番] (各セクションは下のコメントヘッダと一致しています)
 *   1. データ構造とヘルパー関数の準備
 *   2. 保存 (Save) ボタンの処理       ── 新規はタイムライン先頭に prepend
 *   3. 全削除 (Clear) ボタンの処理
 *   4. ページ読み込み時の復元          ── createdAt 降順にソート
 *   5. [課題追加] 1件削除 (removeItem)
 *   6. [課題追加] インライン編集 (contenteditable で 1件更新)
 *   7. 検索フィルタ (input で <li> を絞り込み)
 * ============================================================ */


/* ============================================================
 * 1. データ構造とヘルパー関数の準備
 * ============================================================
 *
 * [localStorage のデータ構造]
 *   キー   = メモのタイトル (例: "買い物リスト")
 *   値     = JSON 文字列 (例: '{"body":"卵\n牛乳","createdAt":1700000000000}')
 *
 * [なぜ JSON で包むのか - 学習意図]
 *   localStorage は「文字列しか」保存できません。
 *   なので本文+作成日時のように複数のデータを一緒に保存したいときは
 *   一度 JSON 文字列に変換 (JSON.stringify) → 取り出す時にオブジェクトに戻す
 *   (JSON.parse) という手間が必要になります。
 *   → DB なら型 (datetime / text など) をそのまま扱えるので、ここが
 *      「PHP + DB が必要になる理由」の1つです。
 */

// メモを <li> として生成するヘルパー関数。
// jQuery の append() に渡すために、<li> ツリーを組み立てて返す。
// .text() を使うので、タイトルや本文に < > " などが混ざっても
// HTML として解釈されない (XSS 対策にもなる、これも DB+サーバーの話に繋がる)。
function createMemoLi(title, body, createdAt) {
  const $li = $("<li>").attr("data-key", title);

  // 削除ボタン (× 印)。クリックで 1件削除 (セクション 5 で on でフック)
  $li.append(
    $("<button>", {
      class: "memo-delete",
      type: "button",
      title: "このメモを削除"
    }).text("×")
  );

  // 作成日時 (アバター横、X のヘッダーの「日時」位置)
  $li.append(
    $("<div>", { class: "memo-date" }).text(formatDate(createdAt))
  );

  // タイトル (= いまの気持ち)。日時の下、本文の上。contenteditable で直接編集可。
  $li.append(
    $("<h3>", {
      class: "memo-title",
      contenteditable: "true"
    }).text(title)
  );

  // 本文。同じく contenteditable
  $li.append(
    $("<p>", {
      class: "memo-body",
      contenteditable: "true"
    }).text(body)
  );

  // [見た目だけ] X風アクションバー (返信/リポスト/いいね/ブックマーク)。
  // 学習対象の localStorage 処理には一切関与しない純粋な装飾。
  const actions = [
    { cls: "reply",    icon: "💬", label: "返信" },
    { cls: "repost",   icon: "🔁", label: "リポスト" },
    { cls: "like",     icon: "♡",  label: "いいね" },
    { cls: "bookmark", icon: "🔖", label: "ブックマーク" }
  ];
  const $actions = $("<div>", { class: "memo-actions" });
  actions.forEach(function (a) {
    $actions.append(
      $("<span>", { class: "action " + a.cls, title: a.label })
        .append($("<span>", { class: "action-icon" }).text(a.icon))
    );
  });
  $li.append($actions);

  return $li;
}

// タイムスタンプ (ミリ秒) → "YYYY-MM-DD HH:MM" 文字列に整形。
// padStart(2,"0") で 1桁の月や時を "01" のようにゼロ埋めしている。
function formatDate(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi;
}

// 同じ data-key の <li> を取得するヘルパー。
// data-key にはユーザーが入力した任意の文字列が入り得るので、CSS セレクタで
// 組み立てると " などの記号でクラッシュする恐れがある。
// → .filter() の関数フォームで文字列比較する方が安全。
function findLiByKey(key) {
  return $("#list li").filter(function () {
    return $(this).attr("data-key") === key;
  });
}


/* ============================================================
 * 2. 保存 (Save) ボタンの処理
 * ============================================================
 *
 * [使う技術]
 *   - jQuery の .val()   → input/textarea の値を取得
 *   - localStorage.setItem(キー, 値)
 *   - JSON.stringify({...})  → オブジェクトを文字列化
 *
 * [仕様]
 *   - タイトルが空のときは保存しない (ユーザーに通知)
 *   - 同じタイトルが既に存在する場合は「上書き」扱い
 *       → 元の作成日時 (createdAt) は引き継ぐ (更新ではなく作成日として扱う)
 *   - 保存後は入力欄をクリアして次のメモを入力しやすくする
 */
$("#save").on("click", function () {

  // 入力値の取得
  const title = $("#title").val().trim(); // 前後の空白は除去
  const body = $("#text").val();          // 本文は改行を残すので trim しない

  // ひとこと(必須) チェック
  if (!title) {
    alert("ひとことを入力してください");
    return;
  }

  // 既存の同名キーがあれば、元の作成日時を引き継ぐ
  let createdAt = Date.now(); // デフォルトは「今」
  const existing = localStorage.getItem(title);
  if (existing !== null) {
    try {
      const obj = JSON.parse(existing);
      if (obj.createdAt) createdAt = obj.createdAt;
    } catch (e) {
      // JSON でないレガシーデータは無視 (createdAt は now のまま)
    }
  }

  // localStorage への保存。
  // JSON.stringify で {body, createdAt} を1本の文字列にまとめる。
  localStorage.setItem(title, JSON.stringify({ body: body, createdAt: createdAt }));

  // DOM 側も同期する
  // 同名 <li> があれば中身を書き換え、無ければ新規追加。
  // タイムライン UI なので、新規追加は append ではなく prepend
  // (= リストの先頭に挿入)。これで新しい投稿が一番上に並ぶ。
  const $existingLi = findLiByKey(title);
  if ($existingLi.length) {
    $existingLi.find(".memo-title").text(title);
    $existingLi.find(".memo-body").text(body);
    $existingLi.find(".memo-date").text(formatDate(createdAt));
  } else {
    $("#list").prepend(createMemoLi(title, body, createdAt));
  }

  // 入力欄をクリア → メイン入力にフォーカスを戻し、青リングを脈動させて
  // 「保存できた → ここに次を書ける」を視覚的に伝える。
  $("#text").val("");
  $("#title").val("").focus().addClass("just-saved");
  setTimeout(function () {
    $("#title").removeClass("just-saved");
  }, 700);
});


/* ============================================================
 * 3. 全削除 (Clear) ボタンの処理
 * ============================================================
 *
 * [使う技術]
 *   - localStorage.clear()  → 全件まとめて削除
 *   - jQuery の .empty()    → <ul id="list"> の中身を全消去
 *
 * 誤操作で全部消えると悲しいので confirm() で一度確認を取る。
 */
$("#clear").on("click", function () {
  if (!confirm("すべての記録を消してよろしいですか？")) return;
  localStorage.clear();
  $("#list").empty();
});


/* ============================================================
 * 4. ページ読み込み時の復元 (for + length + key + getItem + sort)
 * ============================================================
 *
 * [使う技術]
 *   - for (let i = 0; i < localStorage.length; i++)
 *       → 「タンス」(localStorage) の中身を 0 番目から順に取り出す
 *   - localStorage.key(i)    → i 番目のキー名を取得
 *   - localStorage.getItem() → そのキーに対応する値を取得
 *   - Array.prototype.sort() → 配列を並び替える (タイムライン化)
 *
 * [学習意図]
 *   ここがまさに授業で扱った「配列の長さ length と for 文を組み合わせて
 *   一気に処理する」典型例 (PDF p.16)。
 *   さらに、localStorage.key(i) の並びはブラウザ依存なので、
 *   表示順を「新しい投稿が上」(= タイムライン) にしたい今回は、
 *   一度配列に集めて createdAt で降順ソートする必要がある。
 *   ── これも「localStorage に並び順の概念が無い」という素朴さの裏返しで、
 *      DB なら ORDER BY 一発で済む話 ── PDF p.8 の伏線につながる。
 */

// まず全件を配列に集める
const allMemos = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const raw = localStorage.getItem(key);

  // JSON で包んだデータを取り出す。
  // 古い素の文字列データが混ざっている可能性に備えて try/catch でフォールバック。
  let body = "";
  let createdAt = Date.now();
  try {
    const obj = JSON.parse(raw);
    body = obj.body || "";
    createdAt = obj.createdAt || Date.now();
  } catch (e) {
    body = raw || "";
  }

  allMemos.push({ key: key, body: body, createdAt: createdAt });
}

// createdAt の降順 (新しいものが先) でソート
allMemos.sort(function (a, b) {
  return b.createdAt - a.createdAt;
});

// 上から順に append すれば、新しい投稿が一番上に並ぶ
allMemos.forEach(function (m) {
  $("#list").append(createMemoLi(m.key, m.body, m.createdAt));
});


/* ============================================================
 * 5. [課題追加] 1件削除 (removeItem)
 * ============================================================
 *
 * [使う技術]
 *   - localStorage.removeItem(キー)  → そのキーだけを削除
 *   - jQuery のイベント委譲 .on("click", ".memo-delete", ...)
 *       → 後から append された <li> 内のボタンにもイベントが効く
 *
 * [学習意図]
 *   授業では「全削除 (clear)」しか扱っていない。
 *   1件だけ消すには removeItem(キー) を使う ──ここで初めて、
 *   「キー単位の操作」というデータベース的な考え方に触れる。
 */
$("#list").on("click", ".memo-delete", function () {
  // クリックされた × ボタンが属する <li> と、その data-key (= タイトル) を取得
  const $li = $(this).closest("li");
  const key = $li.attr("data-key");

  if (!confirm("「" + key + "」を消してよろしいですか？")) return;

  localStorage.removeItem(key); // データ削除
  $li.remove();                  // 画面からも削除
});


/* ============================================================
 * 6. [課題追加] インライン編集 (contenteditable で 1件更新)
 * ============================================================
 *
 * [使う技術]
 *   - HTML 属性 contenteditable="true"   → 要素を直接編集可能に
 *   - jQuery .on("blur", ...)             → フォーカスが外れた瞬間に保存
 *   - キーボードの Enter は改行ではなく「保存」扱いにする (タイトルのみ)
 *
 * [仕様]
 *   - タイトル or 本文をクリック → そのまま編集 → blur で保存
 *   - タイトルが変わったら、旧キーを removeItem → 新キーで setItem
 *     (localStorage のキー名 = タイトル、という設計なのでこの手当てが必要)
 *
 * [学習意図 - localStorage の限界]
 *   キー名そのものを「変えたい」とき、localStorage には「キーを rename する」
 *   API がありません。仕方なく「削除 → 改名で再登録」の2手順を踏みます。
 *   DB ならただの UPDATE で済む話。これも DB が欲しくなる場面です。
 */

// Enter キーを「改行ではなく保存トリガー」にする (タイトル欄のみ)。
// 本文 (.memo-body) では改行を許可したいので対象外。
$("#list").on("keydown", ".memo-title", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();   // 改行が入るのを止める
    $(this).blur();       // blur すれば下のハンドラが走って保存される
  }
});

// blur で保存。.memo-title と .memo-body 両方を対象に同じ処理を適用。
$("#list").on("blur", ".memo-title, .memo-body", function () {
  const $li = $(this).closest("li");
  const oldKey = $li.attr("data-key");
  const newTitle = $li.find(".memo-title").text().trim();
  const newBody = $li.find(".memo-body").text();

  // ひとことを空にした場合は元に戻す (キー無しでは保存できないため)
  if (!newTitle) {
    alert("ひとことは空にできません");
    $li.find(".memo-title").text(oldKey);
    return;
  }

  // 元の作成日時を維持 (編集は「更新」であって「作成」ではない)
  let createdAt = Date.now();
  const oldRaw = localStorage.getItem(oldKey);
  if (oldRaw !== null) {
    try {
      const obj = JSON.parse(oldRaw);
      if (obj.createdAt) createdAt = obj.createdAt;
    } catch (e) {}
  }

  // タイトルが変わった場合 (= キー名変更)
  if (newTitle !== oldKey) {
    // 別の既存メモと衝突するなら拒否
    if (localStorage.getItem(newTitle) !== null) {
      alert("同じひとことの記録が既にあります");
      $li.find(".memo-title").text(oldKey); // ひとことを元に戻す
      return;
    }
    localStorage.removeItem(oldKey);   // 旧キーは消す
    $li.attr("data-key", newTitle);    // <li> の目印も更新
  }

  // 新しい内容で書き込み
  localStorage.setItem(newTitle, JSON.stringify({ body: newBody, createdAt: createdAt }));
});


/* ============================================================
 * 7. 検索フィルタ (keyup で <li> を絞り込み)
 * ============================================================
 *
 * [使う技術]
 *   - jQuery の .on("input")   → 値が変わるたびにイベント発火
 *       (keyup より広く、ペーストや日本語IME確定にも反応する)
 *   - .each() で全 <li> をループし、.show() / .hide() で表示制御
 *
 * 大文字小文字の差を無視するため、両方を toLowerCase() で揃えてから比較。
 * タイトルと本文どちらかに含まれていればヒット。
 */
$("#search").on("input", function () {
  const q = $(this).val().toLowerCase();

  $("#list li").each(function () {
    const title = $(this).find(".memo-title").text().toLowerCase();
    const body = $(this).find(".memo-body").text().toLowerCase();

    if (title.indexOf(q) !== -1 || body.indexOf(q) !== -1) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
});


/* ============================================================
 * 8. [遊び] アクションバーの小演出
 *   - リポスト: カーソルを乗せたらそのポストを一番上にプレッペンド
 *   - いいね: クリックで ♡ → ♥ にトグル、隣に「100」がポンと出る
 * 純粋な見た目のお楽しみで、localStorage には書き込まない。
 * ============================================================ */

// リポスト: hover でリスト最上段へ
$("#list").on("mouseenter", ".action.repost", function () {
  const $li = $(this).closest("li");
  // すでに一番上ならスキップ (連続発火防止 + 無駄なDOM操作回避)
  if ($li.is("#list > li:first-child")) return;
  // 検索でフィルタ中は順序変更しない (UX が壊れる)
  if ($("#search").val()) return;

  $li.prependTo("#list").addClass("just-reposted");
  setTimeout(function () {
    $li.removeClass("just-reposted");
  }, 800);
});

// いいね: クリックで ♡↔♥ トグル、隣に 100 を表示
$("#list").on("click", ".action.like", function () {
  const $like = $(this);
  const $icon = $like.find(".action-icon");
  const liked = $like.toggleClass("liked").hasClass("liked");

  $icon.text(liked ? "♥" : "♡");

  if (liked) {
    if (!$like.find(".action-count").length) {
      $like.append($("<span>", { class: "action-count" }).text("100"));
    }
  } else {
    $like.find(".action-count").remove();
  }
});
