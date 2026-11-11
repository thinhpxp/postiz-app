import { BaseBrowserBot, ParsedCookie } from './base-browser.bot';
import { existsSync } from 'fs';
import { join } from 'path';

export interface XUserInfo {
  id: string;
  name: string;
  username: string;
  picture: string;
}

export interface XBotSelectorConfig {
  tweetEditor?: string;
  tweetSubmit?: string;
  mediaInput?: string;
  replyEditor?: string;
  replySubmit?: string;
}

export const DEFAULT_X_SELECTORS: Required<XBotSelectorConfig> = {
  tweetEditor: '[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]',
  tweetSubmit: '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
  mediaInput: 'input[data-testid="fileInput"], input[type="file"][accept*="image"]',
  replyEditor: '[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]',
  replySubmit: '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
};

export function resolveXSelector(
  customConfig: XBotSelectorConfig | undefined,
  key: keyof XBotSelectorConfig
): string {
  if (customConfig && customConfig[key] && customConfig[key]!.trim()) {
    return customConfig[key]!.trim();
  }
  return DEFAULT_X_SELECTORS[key];
}

export interface XPostPublishPayload {
  cookies: string;
  message: string;
  media?: Array<{ path: string }>;
  proxyUrl?: string;
  botConfig?: XBotSelectorConfig;
}

export interface XReplyPublishPayload {
  cookies: string;
  postUrl: string;
  message: string;
  media?: Array<{ path: string }>;
  proxyUrl?: string;
  botConfig?: XBotSelectorConfig;
}

export class XAdapter extends BaseBrowserBot {
  /**
   * Kiểm tra tính hợp lệ của phiên đăng nhập (Cookies) trên x.com và lấy thông tin user
   */
  async validateSession(cookiesStr: string, proxyUrl?: string): Promise<XUserInfo> {
    const cookies = this.parseCookies(cookiesStr, '.x.com');
    if (!cookies.length) {
      throw new Error('Không tìm thấy cookie hợp lệ. Vui lòng kiểm tra định dạng.');
    }

    const browser = await this.getBrowser(proxyUrl);
    try {
      const page = await this.createStealthPage(browser, cookies);
      // Nạp thêm cookie với domain .twitter.com để tương thích chéo
      try {
        const twitterCookies = cookies.map((c) => ({
          ...c,
          domain: '.twitter.com',
        }));
        await page.setCookie(...twitterCookies);
      } catch {}

      await page.goto('https://x.com/home', {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
        throw new Error('Cookie đã hết hạn hoặc không hợp lệ (Bị chuyển hướng về trang đăng nhập).');
      }

      // Đợi phần tử nhận diện tài khoản đã đăng nhập
      await page.waitForFunction(
        () => {
          return (
            !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
            !!document.querySelector('[data-testid="AppTabBar_Home_Link"]') ||
            !!document.querySelector('[data-testid="tweetTextarea_0"]')
          );
        },
        { timeout: 20000 }
      );

      // Trích xuất thông tin người dùng từ giao diện x.com
      const userInfo = await page.evaluate(() => {
        const accountBtn = document.querySelector(
          '[data-testid="SideNav_AccountSwitcher_Button"]'
        );
        let name = '';
        let username = '';
        let picture = '';

        if (accountBtn) {
          const img = accountBtn.querySelector('img');
          if (img) picture = img.src || '';

          const textContent = accountBtn.textContent || '';
          const matchHandle = textContent.match(/@([a-zA-Z0-9_]+)/);
          if (matchHandle) {
            username = matchHandle[1];
          }

          // Tên hiển thị thường nằm trong span đầu tiên
          const spans = Array.from(accountBtn.querySelectorAll('span'));
          for (const s of spans) {
            const txt = (s.textContent || '').trim();
            if (txt && !txt.startsWith('@') && txt.length < 50) {
              name = txt;
              break;
            }
          }
        }

        return {
          id: username || 'x_user_' + Date.now(),
          name: name || username || 'X User',
          username: username || 'x_user',
          picture: picture || '/no-picture.jpg',
        };
      });

      return userInfo;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Đăng Tweet mới lên X (Twitter)
   */
  async publishTweet(payload: XPostPublishPayload): Promise<{ postId: string; url: string; status: string }> {
    const cookies = this.parseCookies(payload.cookies, '.x.com');
    const browser = await this.getBrowser(payload.proxyUrl);

    try {
      const page = await this.createStealthPage(browser, cookies);
      try {
        const twitterCookies = cookies.map((c) => ({
          ...c,
          domain: '.twitter.com',
        }));
        await page.setCookie(...twitterCookies);
      } catch {}

      // Mở trang compose post trực tiếp
      await page.goto('https://x.com/compose/post', {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
        throw new Error('Cookie X đã hết hạn. Vui lòng cập nhật Cookie mới.');
      }

      const editorSelector = resolveXSelector(payload.botConfig, 'tweetEditor');
      await page.waitForSelector(editorSelector, { timeout: 20000 });
      await this.randomDelay(1000, 2000);

      // Focus và nhập nội dung bài viết
      await page.click(editorSelector);
      await this.typeHuman(page, editorSelector, payload.message);
      await this.randomDelay(1500, 2500);

      // Tải lên media nếu có
      if (payload.media && payload.media.length > 0) {
        await this.handleMediaUpload(page, payload.media, payload.botConfig);
      }

      // Bấm nút Đăng Tweet
      const submitSelector = resolveXSelector(payload.botConfig, 'tweetSubmit');
      await page.waitForSelector(submitSelector, { timeout: 15000 });

      // Đợi nút Post ở trạng thái kích hoạt (không có disabled / aria-disabled)
      await page.waitForFunction(
        (sel: string) => {
          const btn = document.querySelector(sel);
          if (!btn) return false;
          const disabled = btn.getAttribute('disabled') !== null;
          const ariaDisabled = btn.getAttribute('aria-disabled') === 'true';
          return !disabled && !ariaDisabled;
        },
        { timeout: 15000 },
        submitSelector
      );

      await page.click(submitSelector);
      await this.randomDelay(3000, 5000);

      // Kiểm tra toast thông báo gửi thành công hoặc lấy link bài viết
      let tweetUrl = '';
      try {
        const toastLink = await page.waitForSelector('[data-testid="toast"] a[href*="/status/"]', {
          timeout: 10000,
        });
        if (toastLink) {
          const href = await page.evaluate((el: any) => el.getAttribute('href'), toastLink);
          if (href) {
            tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
          }
        }
      } catch {
        // Không bắt được toast kịp thời, fallback về trang profile/home
      }

      const postId = tweetUrl
        ? tweetUrl.split('/status/')[1]?.split('?')[0] || String(Date.now())
        : String(Date.now());

      return {
        postId,
        url: tweetUrl || 'https://x.com',
        status: 'published',
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Đăng bài trả lời (Reply / Comment) vào một Tweet có sẵn
   */
  async replyToTweet(payload: XReplyPublishPayload): Promise<{ commentId: string; url: string; status: string }> {
    const cookies = this.parseCookies(payload.cookies, '.x.com');
    const browser = await this.getBrowser(payload.proxyUrl);

    try {
      const page = await this.createStealthPage(browser, cookies);
      try {
        const twitterCookies = cookies.map((c) => ({
          ...c,
          domain: '.twitter.com',
        }));
        await page.setCookie(...twitterCookies);
      } catch {}

      await page.goto(payload.postUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      const replySelector = resolveXSelector(payload.botConfig, 'replyEditor');
      await page.waitForSelector(replySelector, { timeout: 25000 });
      await this.randomDelay(1000, 2000);

      // Focus và nhập reply
      await page.click(replySelector);
      await this.typeHuman(page, replySelector, payload.message);
      await this.randomDelay(1500, 2500);

      // Upload media nếu có
      if (payload.media && payload.media.length > 0) {
        await this.handleMediaUpload(page, payload.media, payload.botConfig);
      }

      const submitSelector = resolveXSelector(payload.botConfig, 'replySubmit');
      await page.waitForSelector(submitSelector, { timeout: 15000 });

      await page.waitForFunction(
        (sel: string) => {
          const btn = document.querySelector(sel);
          if (!btn) return false;
          return btn.getAttribute('disabled') === null && btn.getAttribute('aria-disabled') !== 'true';
        },
        { timeout: 15000 },
        submitSelector
      );

      await page.click(submitSelector);
      await this.randomDelay(3000, 5000);

      return {
        commentId: String(Date.now()),
        url: payload.postUrl,
        status: 'published',
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Xử lý tải lên tệp đa phương tiện (Ảnh / Video)
   */
  private async handleMediaUpload(
    page: any,
    mediaList: Array<{ path: string }>,
    botConfig?: XBotSelectorConfig
  ) {
    if (!mediaList || mediaList.length === 0) return;

    const fileInputSelector = resolveXSelector(botConfig, 'mediaInput');
    const fileInput = await page.$(fileInputSelector);

    if (!fileInput) {
      console.warn('[XAdapter] Không tìm thấy input file upload:', fileInputSelector);
      return;
    }

    const uploadBase = process.env.UPLOAD_DIRECTORY || '/app/uploads';
    const validPaths: string[] = [];

    for (const item of mediaList) {
      const candidates = [
        item.path,
        join(uploadBase, item.path),
        join('/app/apps/backend/uploads', item.path),
        join(process.cwd(), 'uploads', item.path),
      ];
      for (const p of candidates) {
        if (existsSync(p)) {
          validPaths.push(p);
          break;
        }
      }
    }

    if (validPaths.length > 0) {
      await fileInput.uploadFile(...validPaths);
      // Chờ ảnh / video render preview
      await this.randomDelay(4000, 6000);
    }
  }
}

