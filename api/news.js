// api/news.js —— 保证永远返回长文（Gemini优先，否则拼接）
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
  const lengthReq = '800‑1000字';
  const prompt = lang === 'jp' ?
    `あなたは専門のニュース編集者です。以下の短い記事をもとに、**必ず${lengthReq}程度**の詳しいニュース記事を日本語で書いてください。内容は業界の背景、技術解説、市場への影響、今後の展望を含めてください。重要な専門用語（例：全固体電池、リン酸鉄リチウム）には簡単な説明を付けてください。段落に分けて読みやすくまとめてください。出力は本文のみ、タイトルや前置きは不要です。` :
    `You are a professional news editor. Based on the following short news items, write a comprehensive industry article of **at least 800‑1000 words** in English. Include background, technical analysis, market impact, and future outlook. Provide brief explanations for key technical terms. Structure with paragraphs. Output only the body text, no title.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { text: `Title: ${title}\n\nSource materials:\n${summaries}` }] }],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.7
          }
        })
      }
    );
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error('Gemini error:', e);
    return null;
  }
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
  const link = firstArticle.url;

  // 拼接所有文章的摘要+内容
  const summaries = articles.map(a => {
    const desc = cleanText(a.description || '');
    const cont = cleanText(a.content || '');
    return desc.length > cont.length ? desc : cont;
  }).join('\n\n---\n\n');

  let content = summaries; // 默认用拼接好的多篇文章内容，通常有几百字

  // 尝试 Gemini 扩写
  if (GEMINI_API_KEY) {
    const expanded = await expandWithGemini(title, summaries, lang);
    if (expanded && expanded.length > 200) {
      content = expanded; // 用长文替换
    }
  }

  // 如果最终内容仍然很短（比如API返回的全是空），加一个兜底
  if (content.length < 100) {
    content = `${title}。このニュースは本日の最新情報です。詳細は元記事をご参照ください。\n\n` + summaries;
  }

  return {
    id: `${lang}_${topic}_${Date.now()}`,
    title,
    source,
    link,
    content
  };
}

export default async function handler(req, res) {
  try {
    const result = { japanese: {}, english: {} };
    for (const topic of Object.keys(TOPICS)) {
      result.japanese[topic] = [(await fetchTopicNews(topic, 'jp'))].filter(Boolean);
      result.english[topic] = [(await fetchTopicNews(topic, 'en'))].filter(Boolean);
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}