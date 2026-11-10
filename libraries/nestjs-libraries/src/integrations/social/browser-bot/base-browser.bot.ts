import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Kích hoạt plugin stealth để ẩn cờ bot và giả lập fingerprint trình duyệt thật
puppeteer.use(StealthPlugin());

export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

export abstract class BaseBrowserBot {
  protected wsUrl =
    process.env.BROWSERLESS_WS_URL ||
    (process.env.BROWSERLESS_HOST
      ? `ws://${process.env.BROWSERLESS_HOST}:${process.env.BROWSERLESS_PORT || 3000}${
          process.env.BROWSERLESS_TOKEN
            ? `?token=${process.env.BROWSERLESS_TOKEN}`
            : ''
        }`
      : 'ws://browserless:3000?token=postiz_browserless_secure_key_2026');

  /**
   * Kết nối tới Browserless qua giao thức Chrome DevTools Protocol (CDP) WebSocket
   */
  protected async getBrowser() {
    return (puppeteer as any).connect({
      browserWSEndpoint: this.wsUrl,
    });
  }

  /**
   * Tạo tab mới với User-Agent chuẩn desktop và nạp cookies
   */
  protected async createStealthPage(browser: any, cookies: ParsedCookie[]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    // Vô hiệu hóa hộp thoại thông báo / dialogs
    await page.evaluateOnNewDocument(() => {
      // Ẩn cờ navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      // Vô hiệu hóa permission notifications
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as any)
          : originalQuery(parameters);
    });

    if (cookies?.length) {
      await page.setCookie(...cookies);
    }

    return page;
  }

  /**
   * Phân giải Cookie từ chuỗi người dùng nhập (hỗ trợ cả JSON của Cookie-Editor lẫn Header String)
   */
  public parseCookies(rawInput: string, defaultDomain = '.facebook.com'): ParsedCookie[] {
    if (!rawInput || typeof rawInput !== 'string') {
      return [];
    }

    const trimmed = rawInput.trim();

    // 1. Thử parse định dạng mảng JSON (xuất từ Cookie-Editor hoặc EditThisCookie)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const jsonCookies = JSON.parse(trimmed);
        return jsonCookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain?.startsWith('.') ? c.domain : `.${c.domain || defaultDomain}`,
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly ?? false,
        }));
      } catch (err) {
        // Fallback to text parsing
      }
    }

    // 2. Parse định dạng chuỗi HTTP Header (c_user=123; xs=abc; datr=xyz;)
    const result: ParsedCookie[] = [];
    const pairs = trimmed.split(';');

    for (const pair of pairs) {
      const equalIndex = pair.indexOf('=');
      if (equalIndex > 0) {
        const name = pair.substring(0, equalIndex).trim();
        const value = pair.substring(equalIndex + 1).trim();
        if (name && value) {
          result.push({
            name,
            value,
            domain: defaultDomain,
            path: '/',
            secure: true,
          });
        }
      }
    }

    return result;
  }

  /**
   * Mô phỏng hành vi gõ phím của người thật với độ trễ ngẫu nhiên giữa các ký tự
   */
  protected async typeHuman(page: any, selector: string, text: string) {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await page.focus(selector);
    
    // Gõ từng ký tự với delay ngẫu nhiên 25ms - 65ms
    for (const char of text) {
      await page.keyboard.type(char);
      await this.randomDelay(25, 65);
    }
  }

  /**
   * Chờ một khoảng thời gian ngẫu nhiên (ms)
   */
  protected async randomDelay(minMs = 500, maxMs = 1500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Chụp ảnh màn hình lưu lại khi có lỗi xảy ra để Admin dễ chẩn đoán sự cố
   */
  protected async captureErrorScreenshot(page: any, prefix = 'error'): Promise<string> {
    try {
      const uploadDir = process.env.UPLOAD_DIRECTORY || '/app/uploads';
      const debugDir = join(uploadDir, 'debug', 'errors');

      if (!existsSync(debugDir)) {
        mkdirSync(debugDir, { recursive: true });
      }

      const filename = `${prefix}_${Date.now()}.png`;
      const fullPath = join(debugDir, filename);

      const buffer = await page.screenshot({ fullPage: false });
      writeFileSync(fullPath, buffer);

      return fullPath;
    } catch (e) {
      return '';
    }
  }
}

