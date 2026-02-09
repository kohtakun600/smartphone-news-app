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
const FILTER_RULES_PATH = path.join(__dirname, '../config/filter_rules.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Use latest lightweight flash model
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
const filterRules = loadFilterRules();
const allowKeywordMatchers = filterRules.allow_keywords.map((term) => ({
    term,
    pattern: buildTermPattern(term)
}));
const excludeKeywordMatchers = filterRules.exclude_keywords.map((term) => ({
    term,
    pattern: buildTermPattern(term)
}));

function loadFilterRules() {
    try {
        const raw = fs.readFileSync(FILTER_RULES_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            allow_keywords: Array.isArray(parsed.allow_keywords) ? parsed.allow_keywords : [],
            exclude_domains: Array.isArray(parsed.exclude_domains) ? parsed.exclude_domains : [],
            exclude_keywords: Array.isArray(parsed.exclude_keywords) ? parsed.exclude_keywords : []
        };
    } catch (error) {
        console.error(`Failed to load filter rules from ${FILTER_RULES_PATH}:`, error.message);
        return {
            allow_keywords: [],
            exclude_domains: [],
            exclude_keywords: []
        };
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermPattern(term) {
    const escaped = escapeRegExp(term.trim().toLowerCase()).replace(/\s+/g, '\\s+');
    const isShortWord = /^[a-z0-9]{1,3}$/i.test(term.trim());
    const regexSource = isShortWord ? `\\b${escaped}\\b` : escaped;
    return new RegExp(regexSource, 'i');
}

function extractHost(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname.toLowerCase();
    } catch (_) {
        return '';
    }
}

function isExcludedDomain(url) {
    const host = extractHost(url);
    if (!host) return false;
    return filterRules.exclude_domains.some((domain) => {
        const normalized = String(domain).toLowerCase().trim();
        return host === normalized || host.endsWith(`.${normalized}`);
    });
}

function findMatchedTerms(text, matchers) {
    return matchers
        .filter(({ pattern }) => pattern.test(text))
        .map(({ term }) => term.toLowerCase());
}

function isAiRelatedArticle(article) {
    const title = article.title || '';
    const description = article.description || '';
    const content = article.content || '';
    const source = article?.source?.name || '';
    const combinedText = `${title}\n${description}\n${content}\n${source}`.toLowerCase();

    if (isExcludedDomain(article.url)) {
        return false;
    }

    const allowHits = findMatchedTerms(combinedText, allowKeywordMatchers);
    if (allowHits.length === 0) {
        return false;
    }

    const excludeHits = findMatchedTerms(combinedText, excludeKeywordMatchers);
    if (excludeHits.length > 0) {
        const hasOnlyAiAsAllowTerm = allowHits.every((term) => term === 'ai');
        if (hasOnlyAiAsAllowTerm) {
            return false;
        }
        return false;
    }

    return true;
}

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

    const validArticles = articles.filter((article) => article.title !== '[Removed]');
    const filteredArticles = validArticles.filter(isAiRelatedArticle);
    const sortedArticles = filteredArticles.sort((a, b) => {
        const dateA = new Date(a.publishedAt || 0).getTime();
        const dateB = new Date(b.publishedAt || 0).getTime();
        return dateB - dateA;
    });
    const topArticles = sortedArticles.slice(0, 20);

    console.log(`Fetched ${articles.length} articles.`);
    console.log(`After AI filter: ${filteredArticles.length} articles.`);
    console.log(`Processing ${topArticles.length} articles...`);

    if (topArticles.length === 0) {
        console.log('No AI-related articles found after filtering.');
        return;
    }

    const processedArticles = [];

    for (const article of topArticles) {
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
