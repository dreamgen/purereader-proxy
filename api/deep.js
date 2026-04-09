import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    // 1. 設定 CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: '請提供 url 參數' });
    }

    // BrowserBase 免費版限制：60 分鐘/月、1 concurrent session、每次 session 上限 15 分鐘
    // 每次請求約用 10 秒，月上限約 360 次請求
    let browser = null;

    try {
        // 2. 連接至 BrowserBase 遠端瀏覽器
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}&projectId=${process.env.BROWSERBASE_PROJECT_ID}`,
        });

        const page = await browser.newPage();

        // 3. 模擬真實瀏覽器，避免被網站 bot 偵測攔截
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7' });

        // 4. 效能優化：不載入圖片、影片、CSS，節省 session 用量
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'media', 'font', 'other'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // 4. 前往目標網址，等待 DOM 載入（8 秒上限，避免 session 超時）
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });

        // 5. 強制等待 1.5 秒，讓 JS 把文章畫出來
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 6. 獲取渲染後的最終 HTML
        const html = await page.content();
        res.status(200).send(html);

    } catch (error) {
        res.status(500).json({ error: `Puppeteer 渲染失敗: ${error.message}` });
    } finally {
        // 確保 session 無論成功或失敗都必定關閉，避免消耗免費用量
        if (browser) await browser.close();
    }
}
