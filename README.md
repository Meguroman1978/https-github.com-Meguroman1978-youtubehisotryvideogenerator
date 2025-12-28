
# Historian: YouTube History Video Generator

このプロジェクトは、Google Gemini API (Gemini 3, Veo 3.1) を活用して、歴史上の人物や事件に関する感動的なショート動画を自動生成するアプリケーションです。

## 特徴

- **AIストーリーボード**: Gemini 3 Flashが歴史的背景に基づいた5つのシーンを構成。
- **AI画像・動画生成**: Gemini 2.5 Flash Image と Veo 3.1 を使用して高品質なビジュアルを生成。
- **AIナレーション**: Gemini 2.5 Flash TTSによる重厚な音声ガイド。
- **YouTube連携**: 生成した動画をそのままYouTubeにアップロード可能（Resumable Upload対応）。
- **FFmpeg統合**: ブラウザ上で動画、音声、BGMを合成し、MP4として出力。

## セットアップ

1. **APIキーの設定**
   - [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得してください。
   - `process.env.API_KEY` として設定されます。

2. **YouTube APIの設定**
   - Google Cloud Consoleでプロジェクトを作成し、YouTube Data API v3を有効にします。
   - OAuth 2.0 クライアントIDを作成し、`components/VideoPreview.tsx` の `YOUTUBE_CLIENT_ID` を書き換えてください。

3. **実行環境**
   - Node.js 環境で `npm install` 後、`npm start` で起動します。

## ライセンス

MIT License
