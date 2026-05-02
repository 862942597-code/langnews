const TOPICS = {
  battery: '("全固体電池" OR "lithium battery" OR "EV battery")',
  smarthome: '("スマートホーム" OR "smart home" OR "Matter protocol")',
  '3dprint': '("3Dプリンティング" OR "3D printing" OR "laser engraving")',
  ai: '("生成AI" OR "AI speaker" OR "artificial intelligence")'
};

async function fetchNews(topic, lang) {
  const query = TOPICS[topic];
  const language = lang === 'jp' ? 'jp' : 'en';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  if (!data.articles || data.articles.length === 0) return null;

  const a = data.articles[0];
  return {
    id: `${lang}_${topic}_${Date.now()}`,
    title: a.title,
    source: a.source.name,
    content: (a.description || '') + (a.content ? a.content.substring(0, 600) : '')
  };
}

export default async function handler(req, res) {
  try {
    const result = { japanese: {}, english: {} };
    for (const topic of Object.keys(TOPICS)) {
      result.japanese[topic] = [(await fetchNews(topic, 'jp'))].filter(Boolean);
      result.english[topic] = [(await fetchNews(topic, 'en'))].filter(Boolean);
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}