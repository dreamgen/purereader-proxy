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

    let browser = null;

    try {
        // 2. 連接至 BrowserBase 遠端瀏覽器
        browser = await puppeteer.connect({
            browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}&projectId=${process.env.BROWSERBASE_PROJECT_ID}`,
        });

        const page = await browser.newPage();

        // 4. 效能優化：不載入圖片、影片、CSS，節省 Vercel 運算時間
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'media', 'font', 'other'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // 5. 前往目標網址，等待 DOM 載入
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });

        // 6. 強制等待 1.5 秒，讓 JS 把文章畫出來
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 7. 獲取渲染後的最終 HTML
        const html = await page.content();

        await browser.close();
        res.status(200).send(html);

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ error: `Puppeteer 渲染失敗: ${error.message}` });
    }
}
