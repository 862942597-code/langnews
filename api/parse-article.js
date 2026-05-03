import { extract } from '@extractus/article-extractor';

export default async function handler(req, res) {
  // 只允许POST请求，可以从请求体中获取URL
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing article url' });
  }

  try {
    console.log(`Parsing article: ${url}`);
    const article = await extract(url);
    
    if (!article || !article.content) {
      throw new Error('Could not extract content from the provided URL.');
    }

    // 返回提取到的文章标题和正文内容
    res.status(200).json({
      title: article.title,
      content: article.content // 这是一个HTML字符串，前端需要处理
    });

  } catch (error) {
    console.error('Article parsing failed:', error);
    res.status(500).json({ error: `Failed to parse the article: ${error.message}` });
  }
}