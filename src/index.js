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
        error: 'Method not allowed'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let browser;

    try {
      const { url, email, password } = await request.json();

      if (!url || !email || !password) {
        return new Response(JSON.stringify({
          error: 'Missing required params'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Starting Opel authentication...');

      // Launch browser
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      let capturedCode = null;

      page.on('requestfailed', (req) => {
        const url = req.url();
        console.log('Redirect captured:', url);
        if (url.startsWith('mym')) {
          try {
            const urlParams = new URLSearchParams(url.split('?')[1]);
            const code = urlParams.get('code');
            if (code) {
              capturedCode = code;
              console.log('Code captured:', code);
            }
          } catch (e) {
            console.error('Error parsing URL:', e.message);
          }
        }
      });

      console.log('Navigating to login...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const SELECTORS = {
        email: '#gigya-login-form > input[name="username"]',
        password: '#gigya-login-form > input[name="password"]',
        submit: '#gigya-login-form > input[type="submit"]',
        authorize: '#cvs_from > input[type="submit"]'
      };

      console.log('Waiting for login form...');
      await page.waitForSelector(SELECTORS.email, { timeout: 20000 });
      await page.waitForSelector(SELECTORS.password, { timeout: 20000 });
      await page.waitForSelector(SELECTORS.submit, { timeout: 20000 });

      console.log('Filling credentials...');
      await page.type(SELECTORS.email, email, { delay: 100 });
      await page.type(SELECTORS.password, password, { delay: 100 });

      console.log('Submitting login form...');
      await page.click(SELECTORS.submit);

      console.log('Submitting confirm form...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      console.log('Waiting for confirm form...');
      await page.waitForSelector(SELECTORS.authorize, { timeout: 20000 });

      console.log('Submitting confirm form...');
      await page.click(SELECTORS.authorize);

      await new Promise(resolve => setTimeout(resolve, 3000)));

      await browser.close();

      if (capturedCode) {
        return new Response(JSON.stringify({ code: capturedCode }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        error: 'Code not found after authentication'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }

      console.error('Error:', error.message);

      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
