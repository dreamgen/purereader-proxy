import puppeteer from 'puppeteer-core';

// 免費版限制：
//   BrowserBase     — 60 分鐘/月、1 concurrent session
//   Browserless.io  — 1,000 units/月、每次請求約 10 秒 ≈ 360 次/月
// 策略：優先使用 BrowserBase，連線失敗時自動切換至 Browserless.io
async function connectBrowser() {
    try {
        return await puppeteer.connect({
            browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}&projectId=${process.env.BROWSERBASE_PROJECT_ID}`,
        });
    } catch {
        return await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
        });
    }
}

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
        // 2. 連接遠端瀏覽器（BrowserBase 優先，失敗自動備援至 Browserless.io）
        browser = await connectBrowser();

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

        // 5. 前往目標網址，等待 DOM 載入（8 秒上限，避免 session 超時）
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });

        // 6. 強制等待 1.5 秒，讓 JS 把文章畫出來
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 7. 獲取渲染後的最終 HTML
        const html = await page.content();
        res.status(200).send(html);

    } catch (error) {
        res.status(500).json({ error: `Puppeteer 渲染失敗: ${error.message}` });
    } finally {
        // 確保 session 無論成功或失敗都必定關閉，避免消耗免費用量
        if (browser) await browser.close();
    }
}
