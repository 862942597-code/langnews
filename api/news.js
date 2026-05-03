// api/news.js —— 干净长文生成器
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
    `あなたは専門のニュース編集者です。以下の短い記事をもとに、**必ず800〜1000字程度**の詳しいニュース記事を日本語で書いてください。
重要なルール：
- 内容は業界の背景、技術解説、市場への影響、今後の展望を含める
- 重要な専門用語には簡単な説明を付け、**太字**で示す
- 段落に分けて読みやすくまとめる
- **絶対にURLや引用元の表記を含めない**
- 出力は完成した記事本文のみ、タイトルや前置きは不要
- 日本語の自然な文章で書く` :
    `You are a professional news editor. Based on the following short news items, write a comprehensive industry article of **at least 800-1000 words** in English.
Important rules:
- Include industry background, technical analysis, market impact, and future outlook
- Add brief explanations for key technical terms and mark them in **bold**
- Structure with clear paragraphs
- **Do NOT include any URLs or source references**
- Output only the finished article body, no title or preamble
- Write in natural, flowing English`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { text: `Title: ${title}\n\nSource materials:\n${summaries}` }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
        })
      }
    );
    const data = await response.json();
    const generated = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (generated && generated.length > 300) {
      // 清洗掉可能残留的URL
      return generated.replace(/https?:\/\/\S+/g, '').replace(/\[\d+\]/g, '');
    }
    return null;
  } catch (e) {
    console.error('Gemini failed:', e);
    return null;
  }
}

async function fetchTopicNews(topic, lang) {
  const query = TOPICS[topic];
  const language = lang === 'jp' ? 'jp' : 'en';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=3&apiKey=${NEWS_API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    const articles = data.articles || [];
    if (articles.length === 0) return null;

    const first = articles[0];
    const title = first.title || (lang === 'jp' ? '今日のニュース' : 'Today\'s News');
    const source = first.source?.name || 'News';
    const link = first.url;

    // 拼接摘要
    const summaries = articles.map(a => {
      const desc = cleanText(a.description || '');
      const cont = cleanText(a.content || '');
      return desc.length > cont.length ? desc : cont;
    }).join('\n\n');

    let content = summaries;

    // 尝试Gemini扩写
    if (GEMINI_API_KEY) {
      const expanded = await expandWithGemini(title, summaries, lang);
      if (expanded && expanded.length > 300) {
        content = expanded;
      }
    }

    return { id: `${lang}_${topic}_${Date.now()}`, title, source, link, content };
  } catch (e) {
    console.error(`NewsAPI failed for ${topic}/${lang}:`, e);
    return null;
  }
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
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}