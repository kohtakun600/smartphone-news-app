require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuration
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_DIR = path.join(__dirname, '../public/data');
const ARCHIVE_DIR = path.join(__dirname, '../public/archives');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Use latest lightweight flash model
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });

async function fetchNews() {
    try {
        console.log('Fetching news from NewsAPI...');
        const response = await axios.get('https://newsapi.org/v2/everything', {
            params: {
                q: '"Artificial Intelligence" OR "Machine Learning" OR "Generative AI"',
                language: 'en',
                sortBy: 'publishedAt',
                pageSize: 50, // Fetch more to filter down
                apiKey: NEWS_API_KEY
            }
        });

        return response.data.articles;
    } catch (error) {
        console.error('Error fetching news:', error.message);
        return [];
    }
}

function buildFallbackSummary(article) {
    // Use description or title as a lightweight fallback summary.
    const base = article.description || article.title || "記事の要約を取得できませんでした。";
    // Trim to ~200 chars to keep UI consistent.
    return base.length > 200 ? `${base.slice(0, 197)}...` : base;
}

async function summarizeArticle(article) {
    const prompt = `
    You are an expert tech news translator.
    1. Translate the title into natural Japanese.
    2. Summarize the article in Japanese in about 3 sentences, focusing on impact and technology.
    
    Return the result in strict JSON format as follows:
    {
      "title_ja": "Translated Title",
      "summary_ja": "Summary text..."
    }

    Title: ${article.title}
    Description: ${article.description}
    Content: ${article.content}
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();
        
        // Clean up markdown code blocks if present
        text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        
        const json = JSON.parse(text);
        return {
            title_ja: json.title_ja || article.title,
            summary_ja: json.summary_ja || buildFallbackSummary(article)
        };

    } catch (error) {
        // Log full details for troubleshooting and use a fallback summary so the UI keeps working.
        console.error(`Error summarizing article "${article.title}":`, error);
        return {
            title_ja: article.title,
            summary_ja: buildFallbackSummary(article)
        };
    }
}

async function processNews() {
    const articles = await fetchNews();
    if (articles.length === 0) {
        console.log('No articles found.');
        return;
    }

    console.log(`Fetched ${articles.length} articles. Processing top 20...`);
    
    // Select top 20 (simple selection for now, could be improved with AI ranking)
    const topArticles = articles.slice(0, 20);
    const processedArticles = [];

    for (const article of topArticles) {
        // Skip removed contents
        if (article.title === '[Removed]') continue;

        const { title_ja, summary_ja } = await summarizeArticle(article);
        processedArticles.push({
            title: article.title,
            title_ja: title_ja,
            original_url: article.url,
            image_url: article.urlToImage,
            published_at: article.publishedAt,
            source: article.source.name,
            summary_ja: summary_ja
        });
        
        // Rate limit handling (simple pause)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save Data
    // Get JST date explicitly
    const today = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date()).replace(/\//g, '-'); // "2026/01/03" -> "2026-01-03"
    const outputData = {
        updated_at: new Date().toISOString(),
        articles: processedArticles
    };

    // Save latest
    fs.writeFileSync(path.join(DATA_DIR, 'latest.json'), JSON.stringify(outputData, null, 2));
    console.log('Saved to public/data/latest.json');

    // Save archive
    fs.writeFileSync(path.join(ARCHIVE_DIR, `${today}.json`), JSON.stringify(outputData, null, 2));
    console.log(`Saved to public/archives/${today}.json`);
}

processNews();
