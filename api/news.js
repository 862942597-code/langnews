// api/news.js —— 已加入内容清洗，解决乱码/过短问题

// 各主题对应的多语言关键词
const TOPICS = {
  battery: '("全固体電池" OR "lithium battery" OR "EV battery" OR "solid-state battery")',
  smarthome: '("スマートホーム" OR "smart home" OR "Matter protocol" OR "connected home")',
  '3dprint': '("3Dプリンティング" OR "3D printing" OR "laser engraving" OR "additive manufacturing")',
  ai: '("生成AI" OR "artificial intelligence" OR "AI speaker" OR "大規模言語モデル")'
};

// 核心清洗函数：把杂乱的文本变成干净的纯文字
function cleanNewsText(rawText) {
  if (!rawText) return '';
  let text = rawText
    // 去掉 HTML 标签
    .replace(/<[^>]*>/g, '')
    // 去掉转义字符 &amp; &lt; 等
    .replace(/&[a-z]+;/gi, '')
    // 去掉网址 (http/https)
    .replace(/https?:\/\/\S+/g, '')
    // 去掉形如 [...+数字 chars] 的截断标记
    .replace(/\[\.\.\.?\+\d+\s*chars\]/gi, '')
    // 把连续多个空格/换行压缩成一个空格
    .replace(/\s+/g, ' ')
    // 去掉首尾空格
    .trim();
  return text;
}

// 从多个字段中挑出最长的有效文本（优先 content，其次 description）
function extractBestContent(article) {
  // 有些文章 content 更长，有些只有 description
  const rawContent = article.content || '';
  const rawDescription = article.description || '';
  
  const cleanContent = cleanNewsText(rawContent);
  const cleanDescription = cleanNewsText(rawDescription);
  
  // 选择更长的那个作为正文
  const bestText = cleanContent.length > cleanDescription.length ? cleanContent : cleanDescription;
  
  // 如果最终获得的正文仍然太短（比如少于100字符），强制补一点说明
  if (bestText.length < 100) {
    return `${article.title}。詳細は元記事をご参照ください。`;
  }
  
  return bestText;
}

// 从 NewsAPI 抓取单个主题的新闻
async function fetchNews(topic, lang) {
  const query = TOPICS[topic];
  const language = lang === 'jp' ? 'jp' : 'en';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.articles || data.articles.length === 0) return null;

  const article = data.articles[0];
  const cleanBody = extractBestContent(article);

  return {
    id: `${lang}_${topic}_${Date.now()}`,
    title: article.title || '無題',
    source: article.source?.name || 'News',
    content: cleanBody
  };
}

// Vercel Serverless Function 入口
export default async function handler(req, res) {
  try {
    const result = { japanese: {}, english: {} };
    for (const topic of Object.keys(TOPICS)) {
      const jpArticle = await fetchNews(topic, 'jp');
      const enArticle = await fetchNews(topic, 'en');
      result.japanese[topic] = jpArticle ? [jpArticle] : [];
      result.english[topic] = enArticle ? [enArticle] : [];
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}