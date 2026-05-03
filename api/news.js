// api/news.js —— 返回文章列表（含原文链接）
const TOPICS = {
  battery: '("全固体電池" OR "lithium battery" OR "EV battery" OR "solid-state battery")',
  smarthome: '("スマートホーム" OR "smart home" OR "Matter protocol" OR "connected home")',
  '3dprint': '("3Dプリンティング" OR "3D printing" OR "laser engraving" OR "additive manufacturing")',
  ai: '("生成AI" OR "artificial intelligence" OR "AI speaker" OR "大規模言語モデル")'
};

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function cleanText(raw) {
  if (!raw) return '';
  return raw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '').replace(/https?:\/\/\S+/g, '').replace(/\[\.\.\.?\+\d+\s*chars\]/gi, '').replace(/\s+/g, ' ').trim();
}

async function expandWithGemini(title, summaries, lang) {
  const prompt = lang === 'jp' ?
    `あなたは専門のニュース編集者です。以下の短い記事をもとに、800〜1000字の詳しいニュース記事を日本語で書いてください。重要な専門用語には簡単な説明を加えてください。段落で読みやすくまとめてください。` :
    `You are a professional news editor. Based on the following short news items, write a comprehensive industry article of 800-1000 words in English. Include important technical terms with brief explanations. Structure with paragraphs.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { text: `Title: ${title}\n\nSource materials:\n${summaries}` }] }]
      })
    }
  );
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function fetchTopicNews(topic, lang) {
  const query = TOPICS[topic];
  const language = lang === 'jp' ? 'jp' : 'en';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=3&apiKey=${NEWS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const articles = data.articles || [];
  if (articles.length === 0) return null;

  const firstArticle = articles[0];
  const title = firstArticle.title || '今日のニュース';
  const source = firstArticle.source?.name || 'News';
  const link = firstArticle.url; // 关键：文章原始链接

  const summaries = articles.map(a => cleanText(a.description || '') || cleanText(a.title || '')).join('\n---\n');

  let content;
  if (GEMINI_API_KEY) {
    content = await expandWithGemini(title, summaries, lang);
  }
  if (!content) {
    content = summaries.length > 100 ? summaries : `${title}。詳細は元記事をご参照ください。`;
  }

  return {
    id: `${lang}_${topic}_${Date.now()}`,
    title,
    source,
    link,       // 前端全文提取必需
    content     // 备用摘要（当全文提取失败时使用）
  };
}

export default async function handler(req, res) {
  try {
    const result = { japanese: {}, english: {} };
    for (const topic of Object.keys(TOPICS)) {
      const jp = await fetchTopicNews(topic, 'jp');
      const en = await fetchTopicNews(topic, 'en');
      result.japanese[topic] = jp ? [jp] : [];
      result.english[topic] = en ? [en] : [];
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}