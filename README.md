# AI Daily News (Personal)

自分専用のAIニュース収集・要約Webアプリです。
毎日07:30(JST)にニュースを収集し、08:00には最新の要約が読めるようになります。

## 技術構成
- **Frontend**: HTML, CSS, Vanilla JS (PWA対応)
- **Backend/Automation**: GitHub Actions (Node.js script)
- **News Source**: NewsAPI
- **Summarization**: Google Gemini 1.5 Flash

## セットアップ手順

### 1. リポジトリの作成
このフォルダの内容をGitHubのプライベート（またはパブリック）リポジトリにプッシュします。

### 2. APIキーの取得
以下のサービスでAPIキーを取得します（無料枠でOK）。
- [NewsAPI](https://newsapi.org/)
- [Google AI Studio (Gemini)](https://aistudio.google.com/)

### 3. GitHub Secretsの設定
リポジトリの `Settings` > `Secrets and variables` > `Actions` に以下のSecretを追加します。
- `NEWS_API_KEY`: NewsAPIのキー
- `GEMINI_API_KEY`: Geminiのキー

### 4. GitHub Pagesの設定
リポジトリの `Settings` > `Pages` に移動します。
- **Source**: `Deploy from a branch`
- **Branch**: `main` (or master) / `public` (docsではなくpublicフォルダを選択できる場合はそちら、できない場合はルート直下にpublicの中身を移動するか、ビルド設定が必要です。※今回は簡易化のため、`public`フォルダをルートとしてデプロイすることを推奨、またはルートに`index.html`を置く構成に変えるか、Pagesの設定で`root`を指定します)

**※推奨設定**:
GitHub Pagesの「Build and deployment」sourceを `GitHub Actions` に設定し、Static HTMLのワークフローを使うと `public` ディレクトリを綺麗にデプロイできます。
または、単純に `public` の中身をルートに移動させてしまうのが一番簡単です。

### 5. ローカルでの実行確認
1. `.env.example` をコピーして `.env` を作成し、APIキーを入力。
2. `npm install`
3. `node scripts/fetch_news.js`
   - `public/data/latest.json` が生成されれば成功です。
4. `index.html` をブラウザで開いて確認。

## 使い方
- スマホのブラウザでGitHub PagesのURL（例: `https://yourname.github.io/repo-name/`）にアクセス。
- ブラウザのメニューから「ホーム画面に追加」を選択。
- アプリとして利用可能になります。
