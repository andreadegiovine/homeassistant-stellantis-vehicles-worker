import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    let browser;

    let processSessionStartTime;
    const logStartProcess = () => {
      processSessionStartTime = performance.now();
      console.log('Process start');
    }
    const logEndProcess = () => {
      const processTiming = processSessionStartTime ? ((performance.now() - processSessionStartTime) / 1000).toFixed(2) : "N/A";
      console.log('Process end:', processTiming);
    }

    let browserSessionStartTime;
    const logStartBrowser = () => {
      browserSessionStartTime = performance.now();
      console.log('Browser start');
    }
    const logEndBrowser = () => {
      const browserTiming = browserSessionStartTime ? ((performance.now() - browserSessionStartTime) / 1000).toFixed(2) : "N/A";
      console.log('Browser end:', browserTiming);
    }

    logStartProcess();

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    const httpResponse = (message, code = 400) => {
      logEndProcess();
      let body = {};
      if (code == 200){
        body = {
          code: message
        };
      }
      if (code == 400){
        if (message.includes('code: 429')) {
          message = 'Remote service rate limit exceeded';
        }
        body = {
          message: message,
          code: code
        };
      }
      console.log("Response:", message);
      return new Response(JSON.stringify(body), {
        status: code,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'POST') {
      return httpResponse('Method not allowed');
    }

    try {
      const { url, email, password } = await request.json();

      if (!url || !email || !password) {
        return httpResponse('Missing required params');
      }

      browser = await puppeteer.launch(env.BROWSER);
      logStartBrowser();
      const page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      let capturedCode = null;

      page.on('requestfailed', (req) => {
        const reqUrl = req.url();
        if (reqUrl.startsWith('mym')) {
          try {
            const urlParams = new URLSearchParams(reqUrl.split('?')[1]);
            const oauthCode = urlParams.get('code');
            if (oauthCode) {
              capturedCode = oauthCode;
              console.log('Code captured!');
            } else {
              console.log('Code missing on redirect:', reqUrl);
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

      console.log('Waiting for redirects...');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

      console.log('Waiting for confirm form...');
      await page.waitForSelector(SELECTORS.authorize, { timeout: 10000 });

      console.log('Submitting confirm form...');
      await page.click(SELECTORS.authorize);

      console.log('Waiting for code capture...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (capturedCode) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      });

      await browser.close().catch(() => {});
      logEndBrowser();

      if (capturedCode) {
        return httpResponse(capturedCode, 200);
      }

      return httpResponse('Code not found');
    } catch (e) {
      console.error(e);
      if (browser) {
        await browser.close().catch(() => {});
        logEndBrowser();
      }

      return httpResponse(e.message);
    }
  }
};
