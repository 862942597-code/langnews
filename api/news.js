// api/news.js —— 使用 Gemini 将短新闻扩写成 800-1000 字长文

const TOPICS = {
  battery: '("全固体電池" OR "lithium battery" OR "EV battery" OR "solid-state battery")',
  smarthome: '("スマートホーム" OR "smart home" OR "Matter protocol" OR "connected home")',
  '3dprint': '("3Dプリンティング" OR "3D printing" OR "laser engraving" OR "additive manufacturing")',
  ai: '("生成AI" OR "artificial intelligence" OR "AI speaker" OR "大規模言語モデル")'
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// 清洗原始文本，去掉 HTML 等
function cleanNewsText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[\.\.\.?\+\d+\s*chars\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 从 Gemini API 获取长文扩写
async function expandNewsWithGemini(title, summaries, lang) {
  const basePrompt = lang === 'jp' ?
    `あなたは日本のニュース編集者です。以下の複数の短いニュースをもとに、800〜1000字程度の詳しい業界ニュース記事を日本語で書いてください。重要な専門用語（全固体電池、リン酸鉄リチウムなど）は太字で示し、必要に応じて簡単な説明を加えてください。必ず1つのまとまった記事として構成し、段落に分けて読みやすくしてください。` :
    `You are a news editor. Based on the following multiple short news items, write a comprehensive industry news article of about 800-1000 words in English. Highlight important technical terms (such as solid-state battery, LFP, etc.) and add brief explanations where appropriate. Structure it as one coherent article with paragraphs.`;

  const userMessage = `Title: ${title}\n\nShort articles:\n${summaries}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: basePrompt },
              { text: userMessage }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();
  if (data.error) {
    console.error('Gemini error:', data.error);
    return null;
  }

  const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return generatedText || null;
}

// 抓取一个主题的多篇文章（取前3篇）
async function fetchArticles(topic, lang) {
  const query = TOPICS[topic];
  const language = lang === 'jp' ? 'jp' : 'en';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=3&apiKey=${NEWS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  return data.articles || [];
}

// 为主函数整合
async function fetchNewsForTopic(topic, lang) {
  const articles = await fetchArticles(topic, lang);
  if (articles.length === 0) return null;

  const firstTitle = articles[0].title || '無題';
  const summaries = articles.map(a => {
    const desc = cleanNewsText(a.description || '');
    const cont = cleanNewsText(a.content || '');
    return desc.length > cont.length ? desc : cont;
  }).join('\n---\n');

  if (!GEMINI_API_KEY) {
    // 如果没有配置 Gemini，就只返回三篇摘要的拼接（短）
    return {
      id: `${lang}_${topic}_${Date.now()}`,
      title: firstTitle,
      source: 'NewsAPI + Gemini (not configured)',
      content: summaries
    };
  }

  // 调用 Gemini 扩写
  const longArticle = await expandNewsWithGemini(firstTitle, summaries, lang);
  if (!longArticle) {
    return {
      id: `${lang}_${topic}_${Date.now()}`,
      title: firstTitle,
      source: 'NewsAPI (Gemini failed)',
      content: summaries
    };
  }

  return {
    id: `${lang}_${topic}_${Date.now()}`,
    title: firstTitle,            // 保持原标题
    source: articles[0].source?.name || 'News',
    content: longArticle          // 这就是 800-1000 字的长文
  };
}

export default async function handler(req, res) {
  try {
    const result = { japanese: {}, english: {} };
    for (const topic of Object.keys(TOPICS)) {
      result.japanese[topic] = [await fetchNewsForTopic(topic, 'jp')].filter(Boolean);
      result.english[topic] = [await fetchNewsForTopic(topic, 'en')].filter(Boolean);
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}