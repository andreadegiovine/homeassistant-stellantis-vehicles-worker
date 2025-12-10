import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed',
        code: 400
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let browser;
    const getBrowserSessionTiming = (startTime) => {
      const endTime = performance.now();
      return ((endTime - startTime) / 1000).toFixed(2);
    }

    try {
      const { url, email, password } = await request.json();

      if (!url || !email || !password) {
        return new Response(JSON.stringify({
          error: 'Missing required params',
          code: 400
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Start browser session...');
      const startTime = performance.now();
      
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      let capturedCode = null;

      page.on('requestfailed', (req) => {
        const url = req.url();
        if (url.startsWith('mym')) {
          console.log('Redirect captured:', url);
          try {
            const urlParams = new URLSearchParams(url.split('?')[1]);
            const code = urlParams.get('code');
            if (code) {
              capturedCode = code;
              console.log('Code captured!');
            }
          } catch (e) {
            console.error('Error parsing URL:', e.message);
          }
        }
      });

      console.log('Navigating to login...');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      const SELECTORS = {
        email: '#gigya-login-form input[name="username"]',
        password: '#gigya-login-form input[name="password"]',
        submit: '#gigya-login-form input[type="submit"]',
        authorize: '#cvs_from input[type="submit"]'
      };

      console.log('Waiting for login form...');
      await page.waitForSelector(SELECTORS.email, { timeout: 10000 });
      await page.waitForSelector(SELECTORS.password, { timeout: 10000 });
      await page.waitForSelector(SELECTORS.submit, { timeout: 10000 });

      console.log('Filling credentials...');
      await page.type(SELECTORS.email, email, { delay: 50 });
      await page.type(SELECTORS.password, password, { delay: 50 });

      console.log('Submitting login form...');
      await page.click(SELECTORS.submit);

      console.log('Submitting confirm form...');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

      console.log('Waiting for confirm form...');
      await page.waitForSelector(SELECTORS.authorize, { timeout: 10000 });

      console.log('Submitting confirm form...');
      await page.click(SELECTORS.authorize);

      await browser.close().catch(() => {});
      console.log('Browser session closed:', getBrowserSessionTiming(startTime));

      await new Promise(resolve => setTimeout(resolve, 500));

      if (capturedCode) {
        return new Response(JSON.stringify({ code: capturedCode }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        error: 'Code not found after authentication',
        code: 400
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
        console.log('Browser session closed:', getBrowserSessionTiming(startTime));
      }

      console.error('Error:', error.message);

      return new Response(JSON.stringify({
        error: error.message,
        code: 400
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
