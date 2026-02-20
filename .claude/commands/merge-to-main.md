---
title: "main反映PRタスク"
read_only: false
type: "command"
argument-hint: "[--no-merge] [release-label]"
---

# main反映PR作成（/merge-to-main）

## 目的

`develop -> main` のリリースPRを定型化し、`main` への直接反映ミスを防ぐ。
`develop -> main` の反映では、この手順を必須導線として扱う。

## 実行手順

1. `CLAUDE.md` と `.ai/workflow.md` のPR運用ルールを確認する。
2. `.context/current_issue` が存在する場合は `current_issue` を把握する。
3. `origin/main` と `origin/develop` を最新化し、`develop` が存在することを確認する。
4. `base=main` / `head=develop` のOpen PRが既にあるか確認する。
5. Open PRがない場合は `develop -> main` のPRを作成する。
   - タイトル例: `release: develop を main へ反映 (<YYYY-MM-DD>)`
   - 本文には、目的・影響範囲・確認手順・未実施項目を記載する。
6. Open PRがある場合は、そのPRを再利用する（重複PRは作成しない）。
7. `--no-merge` が明示されていない場合は、チェック成功を確認してPRをマージする。
8. 結果を日本語で報告する（作成/再利用したPR URL、マージ有無、未実施項目）。

## ルール

- デフォルト動作は「PR作成または再利用後にマージまで実行」。
- `--no-merge` 指定時のみ、PR作成または再利用までで止める。
- `main` への直接push/直接マージは行わない。
- 必須チェック未通過ならマージしない。
- 既存のOpenな `develop -> main` PRがある場合は、それを優先して使う。
- コンフリクトがある場合は自動解消しない。`develop` 側で解消してから同一PRを更新する。
