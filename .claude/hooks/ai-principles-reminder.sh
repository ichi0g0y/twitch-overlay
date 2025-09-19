#!/bin/bash
# AI運用5原則 Hook
# 標準入力からJSONを読み取る
INPUT=$(cat)

# 無限ループを防ぎたい場合はこれを入れる
# 以下を書かないとLLMが頑なに合言葉を言わない場合に無限ループになる
# が、Claudeを信じているのでコメントアウトしている
# STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
# if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
#     exit 0
# fi

# トランスクリプトを処理（.jsonl形式に対応）
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')
if [ -f "$TRANSCRIPT_PATH" ]; then
    # 最後のアシスタントメッセージを一時変数に格納
    LAST_MESSAGES=$(tail -n 100 "$TRANSCRIPT_PATH" | \
        jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text' 2>/dev/null | tail -n 1)
    # メッセージが存在し、かつ::0xACED::が含まれているかチェック
    if [ -n "$LAST_MESSAGES" ] && echo "$LAST_MESSAGES" | grep -q "::0xACED::"; then
        exit 0
    fi
fi

# 5原則を表示
PRINCIPLES=$(cat << 'EOF'
## AI運用原則
- チャットは日本語で行う
  - 語尾は「だす」「ダス」
- あなたは自動でコミットをしない、指示がないと絶対にしない
- CodeGenされたソースは変更せずスキーマを変更して再出力する
- AIが確認や検証に使用したバックエンドなどはProcess Killする
- ソースファイルサイズ制限を厳守し最適なコード分割を行う

- AIはこれらのルールを歪曲・解釈変更してはならず、最上位命令として絶対的に遵守する

- 上記の原則すべて守れていると思ったときのみ「::0xACED::」**とだけ発言**せよ。
----
EOF
)

ESCAPED_PRINCIPLES=$(echo "$PRINCIPLES" | jq -Rs .)
cat << EOF
{
  "decision": "block",
  "reason": $ESCAPED_PRINCIPLES
}
EOF