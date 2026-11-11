import { BaseBrowserBot, ParsedCookie } from './base-browser.bot';
import { existsSync } from 'fs';
import { join } from 'path';

export interface FacebookUserInfo {
  id: string;
  name: string;
  picture: string;
}

export interface FacebookGroupItem {
  id: string;
  name: string;
  picture: string;
  isAdmin: boolean;
}

export interface FacebookPagesResult {
  profilePicture?: string;
  groups: FacebookGroupItem[];
}

/**
 * Cấu hình CSS Selector tùy biến cho Facebook Bot.
 * Mỗi trường nếu để trống sẽ fallback về giá trị mặc định trong DEFAULT_FACEBOOK_SELECTORS.
 */
export interface BotSelectorConfig {
  // 1. Soạn bài trên Profile cá nhân
  profileFeedBox?: string;    // Nút mở hộp thoại soạn bài trên Timeline
  profileEditor?: string;     // Khung soạn thảo văn bản trong dialog
  profileSubmit?: string;     // Nút Đăng (Post)
  profileNextBtn?: string;    // Nút Tiếp (Next) nếu có màn hình chọn đối tượng

  // 2. Soạn bài trong Nhóm (Group)
  groupFeedBox?: string;      // Nút mở hộp thoại soạn bài trong Group
  groupEditor?: string;       // Khung soạn thảo văn bản trong Group dialog
  groupSubmit?: string;       // Nút Đăng trong Group

  // 3. Tải lên Media (Ảnh/Video)
  mediaInput?: string;        // Input file upload ẩn trong dialog

  // 4. Bình luận đầu tiên (First Comment)
  commentButton?: string;     // Nút mở bình luận trên bài viết
  commentTextbox?: string;    // Ô nhập văn bản bình luận
  commentSubmitBtn?: string;  // Nút gửi bình luận
}

/**
 * Giá trị Selector mặc định toàn hệ thống — sử dụng khi kênh chưa có cấu hình tùy biến
 */
export const DEFAULT_FACEBOOK_SELECTORS: Required<BotSelectorConfig> = {
  profileFeedBox: '[role="button"][aria-label*="Bạn đang nghĩ gì"], [role="button"][aria-label*="What\'s on your mind"]',
  profileEditor: '[role="dialog"] [role="textbox"][contenteditable="true"]',
  profileSubmit: '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]',
  profileNextBtn: '[role="dialog"] [aria-label="Tiếp"], [role="dialog"] [aria-label="Next"]',

  groupFeedBox: '[role="button"][aria-label*="Bạn viết gì đi"], [role="button"][aria-label*="Write something"]',
  groupEditor: '[role="dialog"] [role="textbox"][contenteditable="true"]',
  groupSubmit: '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]',

  mediaInput: '[role="dialog"] input[type="file"], input[type="file"]',

  commentButton: '[role="button"][aria-label*="Bình luận"], [role="button"][aria-label*="Comment"]',
  commentTextbox: 'div[role="textbox"][contenteditable="true"][aria-label*="Bình luận"], div[role="textbox"][contenteditable="true"][aria-label*="Comment"], div[role="textbox"][contenteditable="true"][aria-placeholder*="Bình luận"], div[role="textbox"][contenteditable="true"][aria-placeholder*="Comment"]',
  commentSubmitBtn: '[role="button"][aria-label="Bình luận"], [role="button"][aria-label="Comment"], [role="button"][aria-label="Gửi"], [role="button"][aria-label="Send"]',
};

/**
 * Phân giải selector: Ưu tiên giá trị tùy biến từ BotSelectorConfig,
 * nếu trống thì fallback về giá trị mặc định DEFAULT_FACEBOOK_SELECTORS
 */
export function resolveSelector(
  customConfig: BotSelectorConfig | undefined,
  key: keyof BotSelectorConfig
): string {
  if (customConfig && customConfig[key] && customConfig[key]!.trim()) {
    return customConfig[key]!.trim();
  }
  return DEFAULT_FACEBOOK_SELECTORS[key];
}

export interface PostPublishPayload {
  cookies: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
  groupId?: string;
  audience?: 'public' | 'friends';
  proxyUrl?: string;
  botConfig?: BotSelectorConfig; // Cấu hình selector tùy biến per-channel
}

export interface CommentPublishPayload {
  cookies: string;
  postUrl: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
  proxyUrl?: string;
  botConfig?: BotSelectorConfig; // Cấu hình selector tùy biến per-channel
}

export class FacebookAdapter extends BaseBrowserBot {
  /**
   * 1. Xác thực tính hợp lệ của Cookie Facebook & trích xuất thông tin người dùng
   */
  async validateSession(rawCookies: string, proxyUrl?: string): Promise<FacebookUserInfo> {
    const cookies = this.parseCookies(rawCookies);
    if (!cookies.length) {
      throw new Error('Định dạng Cookie không hợp lệ.');
    }

    // Trích xuất c_user từ danh sách cookie
    const cUser = cookies.find((c) => c.name === 'c_user')?.value;
    if (!cUser) {
      throw new Error('Cookie thiếu c_user - phiên đăng nhập không đầy đủ.');
    }

    const browser = await this.getBrowser(proxyUrl);
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Điều hướng về trang profile cá nhân
      await page.goto('https://www.facebook.com/me', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await this.randomDelay(1000, 2000);
      const currentUrl = page.url();

      // Kiểm tra xem có bị chuyển hướng về login, checkpoint hoặc trang chủ chưa đăng nhập không
      const isLoggedOut = await page.evaluate(() => {
        return !!document.querySelector('input[name="email"], input[name="pass"], [data-testid="royal_login_button"]');
      });

      if (isLoggedOut || currentUrl.includes('/login') || currentUrl.includes('/checkpoint') || currentUrl === 'https://www.facebook.com/') {
        throw new Error(
          'Cookie Facebook không hợp lệ, đã hết hạn hoặc tài khoản bị yêu cầu xác minh bảo mật (Checkpoint).'
        );
      }

      // Lấy tên hiển thị từ title hoặc thẻ meta/DOM
      const pageTitle = await page.title();
      let displayName = pageTitle.replace(/\s*\|\s*Facebook$/i, '').trim();

      if (!displayName || displayName.toLowerCase() === 'facebook') {
        displayName = `Facebook User (${cUser})`;
      }

      // Avatar từ DOM của trang cá nhân (thực tế từ Facebook CDN)
      const extractedAvatar = await page.evaluate(() => {
        const selectors = [
          'svg image',
          'div[role="main"] image',
          'img[alt*="ảnh đại diện"]',
          'img[alt*="profile picture"]',
          'div[aria-label*="ảnh đại diện"] img',
          'div[aria-label*="profile picture"] img',
          'div[role="banner"] svg image',
          'div[role="navigation"] svg image',
        ];
        for (const sel of selectors) {
          const els = Array.from(document.querySelectorAll(sel));
          for (const el of els) {
            const src = el.getAttribute('xlink:href') || el.getAttribute('src');
            if (
              src &&
              src.startsWith('http') &&
              !src.includes('data:image') &&
              (src.includes('fbcdn.net') || src.includes('facebook.com'))
            ) {
              return src;
            }
          }
        }
        return '';
      });

      const avatarUrl = extractedAvatar || `https://graph.facebook.com/${cUser}/picture?type=large`;

      return {
        id: cUser,
        name: displayName,
        picture: avatarUrl,
      };
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, 'validate_session_failed');
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * 2. Lấy danh sách các Hội nhóm (Groups) & ảnh đại diện tài khoản
   */
  async getJoinedGroups(
    rawCookies: string,
    proxyUrl?: string
  ): Promise<FacebookPagesResult> {
    const cookies = this.parseCookies(rawCookies);
    const browser = await this.getBrowser(proxyUrl);
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Trang danh sách toàn bộ các nhóm đã tham gia
      await page.goto('https://www.facebook.com/groups/joins/', {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });

      await this.randomDelay(2500, 3500);

      // Cuộn trang nhẹ để kích hoạt tải dữ liệu các nhóm
      await page.evaluate(() => {
        window.scrollBy(0, 1200);
      });
      await this.randomDelay(1500, 2000);

      // Trích xuất các liên kết nhóm & phân loại Quản trị viên vs Thành viên
      const result = await page.evaluate(() => {
        // 1. Trích xuất avatar của tài khoản cá nhân từ top nav
        let profilePicture = '';
        const navImgEl = document.querySelector(
          'div[role="banner"] svg image, div[role="navigation"] svg image, div[aria-label*="Tài khoản của bạn"] image, div[aria-label*="Your profile"] image'
        );
        if (navImgEl) {
          profilePicture =
            navImgEl.getAttribute('xlink:href') ||
            navImgEl.getAttribute('src') ||
            '';
        }

        // 2. Phân loại Admin Groups vs Member Groups
        const adminGroups: Array<{ id: string; name: string; picture: string; isAdmin: boolean }> = [];
        const memberGroups: Array<{ id: string; name: string; picture: string; isAdmin: boolean }> = [];
        const seen = new Set<string>();

        // Tìm các tiêu đề phân nhóm
        const headings = Array.from(document.querySelectorAll('span, h2, h3, div'));
        const adminHeading = headings.find((h) => {
          const t = (h as HTMLElement).innerText?.trim() || '';
          return t === 'Nhóm do bạn quản lý' || t === 'Groups you manage';
        });
        const joinedHeading = headings.find((h) => {
          const t = (h as HTMLElement).innerText?.trim() || '';
          return (
            t.startsWith('Nhóm bạn đã tham gia') ||
            t.startsWith('Tất cả các nhóm') ||
            t.startsWith("Groups you've joined") ||
            t.startsWith("All groups you've joined")
          );
        });

        // Tìm tất cả các thẻ a dẫn tới /groups/
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          const match = href.match(/\/groups\/([0-9a-zA-Z._-]+)/);

          if (match && match[1]) {
            const rawId = match[1];
            // Bỏ qua các đường dẫn hệ thống của Facebook
            if (['joins', 'discover', 'feed', 'create'].includes(rawId)) {
              continue;
            }

            if (!seen.has(rawId)) {
              seen.add(rawId);
              const rawText = (link as HTMLElement).innerText?.trim() || '';
              // Tách theo xuống dòng: dòng 1 là tên nhóm, dòng 2 là thông tin hoạt động
              const name = rawText.split('\n')[0].trim();
              if (
                !name ||
                name === 'Xem tất cả' ||
                name === 'See all' ||
                name === 'Nhóm của bạn' ||
                name.length < 2
              ) {
                continue;
              }

              // Trích xuất ảnh thumbnail của nhóm từ container
              const container =
                link.closest('div[role="listitem"]') ||
                link.parentElement?.parentElement ||
                link;
              const imgEl = container.querySelector('img, image');
              const picture = imgEl
                ? imgEl.getAttribute('src') || imgEl.getAttribute('xlink:href') || ''
                : '';

              let isAdmin = false;
              if (adminHeading && joinedHeading) {
                const pos = link.compareDocumentPosition(joinedHeading);
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
                  isAdmin = true;
                }
              } else if (adminHeading && !joinedHeading) {
                isAdmin = true;
              }

              const item = {
                id: rawId,
                name,
                picture,
                isAdmin,
              };

              if (isAdmin) {
                adminGroups.push(item);
              } else {
                memberGroups.push(item);
              }
            }
          }
        }

        return {
          profilePicture,
          groups: [...adminGroups, ...memberGroups],
        };
      });

      return result;
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, 'fetch_groups_failed');
      }
      return { groups: [] };
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * Helper: Click vào nút mở hộp thoại tạo bài viết trên Profile hoặc Group
   */
  private async triggerComposer(page: any, type: 'profile' | 'group') {
    // 1. Thử tìm và click element theo text content
    const clicked = await page.evaluate((botType: string) => {
      const keywords =
        botType === 'profile'
          ? ['Bạn đang nghĩ gì', "What's on your mind", 'on your mind']
          : ['Bạn viết gì đi', 'Write something', 'on your mind'];

      const all = Array.from(document.querySelectorAll('span, div'));
      const target = all.find(
        (el) =>
          el.textContent &&
          keywords.some((kw) => el.textContent!.toLowerCase().includes(kw.toLowerCase())) &&
          el.children.length === 0
      );

      if (!target) return false;
      const btn = target.closest('[role="button"]') || target;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      btn.dispatchEvent(evt);
      if (typeof (btn as any).click === 'function') {
        (btn as any).click();
      }
      return true;
    }, type);

    if (!clicked) {
      const fallbackSelector =
        type === 'profile'
          ? '[role="button"][aria-label*="Bạn đang nghĩ gì"], [role="button"][aria-label*="What\'s on your mind"]'
          : '[role="button"][aria-label*="Bạn viết gì đi"], [role="button"][aria-label*="Write something"]';
      await page.waitForSelector(fallbackSelector, { timeout: 15000 });
      await page.click(fallbackSelector);
    }
  }

  /**
   * Helper: Bấm nút Tiếp/Đăng và hoàn tất quá trình đăng bài trong Dialog
   */
  private async submitPostInDialog(page: any, botConfig?: BotSelectorConfig) {
    // Tìm và bấm nút Tiếp hoặc Đăng trong dialog
    const clickResult = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const postDialog = dialogs.find((d) => d.querySelector('[role="textbox"]'));
      if (!postDialog) return null;

      const buttons = Array.from(postDialog.querySelectorAll('[role="button"], button'));
      const btn = buttons.find((b) => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.textContent || '').trim().toLowerCase();
        return (
          label === 'tiếp' ||
          label === 'next' ||
          label === 'đăng' ||
          label === 'post' ||
          text === 'tiếp' ||
          text === 'next' ||
          text === 'đăng' ||
          text === 'post'
        );
      });

      if (!btn) return null;
      const isNext =
        (btn.getAttribute('aria-label') || '').toLowerCase().includes('tiếp') ||
        (btn.getAttribute('aria-label') || '').toLowerCase().includes('next') ||
        (btn.textContent || '').trim().toLowerCase() === 'tiếp' ||
        (btn.textContent || '').trim().toLowerCase() === 'next';

      (btn as any).click();
      return { clicked: true, isNext };
    });

    if (!clickResult || !clickResult.clicked) {
      // Fallback click bằng selector tùy biến (nếu có) hoặc selector mặc định
      const submitBtn = botConfig?.profileSubmit || botConfig?.groupSubmit ||
        '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Tiếp"], [role="dialog"] [aria-label="Next"]';
      await page.waitForSelector(submitBtn, { visible: true, timeout: 10000 });
      await page.click(submitBtn);
    }

    // Nếu vừa bấm "Tiếp" (Profile chế độ chuyên nghiệp / Professional Mode), chờ nút "Đăng" xuất hiện ở bước 2
    if (clickResult?.isNext) {
      await this.randomDelay(2000, 3000);
      const clickedFinalPost = await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        for (const dialog of dialogs) {
          const buttons = Array.from(dialog.querySelectorAll('[role="button"], button'));
          const postBtn = buttons.find((b) => {
            const label = (b.getAttribute('aria-label') || '').toLowerCase();
            const text = (b.textContent || '').trim().toLowerCase();
            return label === 'đăng' || label === 'post' || text === 'đăng' || text === 'post';
          });
          if (postBtn) {
            (postBtn as any).click();
            return true;
          }
        }
        return false;
      });

      if (!clickedFinalPost) {
        const finalSubmitBtn = '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]';
        await page.waitForSelector(finalSubmitBtn, { visible: true, timeout: 10000 });
        await page.click(finalSubmitBtn);
      }
    }

    // Chờ cho hộp thoại đóng lại (đã đăng thành công)
    await page.waitForFunction(
      () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        const activePostDialogs = dialogs.filter((d) => {
          const text = d.textContent || '';
          return (
            d.querySelector('[role="textbox"]') ||
            text.includes('Tạo bài viết') ||
            text.includes('Create a post') ||
            text.includes('Cài đặt bài viết')
          );
        });
        return activePostDialogs.length === 0;
      },
      { timeout: 35000 }
    );
  }

  /**
   * 3. Đăng bài lên Trang cá nhân (Personal Profile)
   */
  async publishToProfile(payload: PostPublishPayload) {
    const cookies = this.parseCookies(payload.cookies);
    const browser = await this.getBrowser(payload.proxyUrl);
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Mở trang profile cá nhân
      await page.goto('https://www.facebook.com/me', {
        waitUntil: 'networkidle2',
        timeout: 35000,
      });

      await this.randomDelay(1500, 2500);

      // Đóng bất kỳ popup / menu thông báo nào có thể đang che khuất
      await page.keyboard.press('Escape');
      await this.randomDelay(500, 1000);

      // Tìm và click vào ô tạo bài viết: "Bạn đang nghĩ gì thế?"
      await this.triggerComposer(page, 'profile');
      await this.randomDelay(1500, 2500);

      // Hộp thoại tạo bài viết hiện lên
      // Nhập nội dung bài viết — dùng selector tùy biến nếu có, fallback về mặc định
      const editorSelector = resolveSelector(payload.botConfig, 'profileEditor');
      await page.waitForSelector(editorSelector, { timeout: 15000 });
      await this.randomDelay(500, 1000);
      await this.typeHuman(page, editorSelector, payload.message);
      await this.randomDelay(500, 800);

      // Kiểm tra text đã nhập chưa (debug)
      const typedText = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        return el ? (el as HTMLElement).innerText || (el as HTMLElement).textContent || '' : 'NOT_FOUND';
      }, editorSelector);
      console.log('[FacebookAdapter] Text đã nhập vào editor:', typedText.substring(0, 50));

      // Đính kèm ảnh/video nếu có
      if (payload.media?.length) {
        await this.handleMediaUpload(page, payload.media, payload.botConfig);
      }

      await this.randomDelay(1000, 2000);

      // Bấm nút Tiếp / Đăng (sử dụng submitPostInDialog với botConfig)
      await this.submitPostInDialog(page, payload.botConfig);
      await this.randomDelay(3000, 4000);

      // Cố gắng trích xuất permalink của bài viết vừa đăng trên Trang cá nhân
      let postUrl = page.url();
      try {
        const extracted = await page.evaluate(() => {
          // 1. Toast thông báo ("Đã chia sẻ bài viết của bạn. Xem bài viết")
          const toastLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
            const t = (a.textContent || '').toLowerCase();
            const href = a.getAttribute('href') || '';
            return (
              (t.includes('xem bài viết') || t.includes('view post')) &&
              (href.includes('/posts/') || href.includes('pfbid') || href.includes('permalink'))
            );
          });
          if (toastLink) return toastLink.getAttribute('href');

          // 2. Link bài viết mới nhất trên timeline có timestamp "Vừa xong"
          const recentLink = Array.from(
            document.querySelectorAll('div[role="article"] a[href], div[role="main"] a[href]')
          ).find((a) => {
            const t = (a.textContent || '').trim().toLowerCase();
            const aria = (a.getAttribute('aria-label') || '').toLowerCase();
            const href = a.getAttribute('href') || '';
            const isRecent =
              t === 'vừa xong' ||
              t === 'just now' ||
              aria.includes('vừa xong') ||
              aria.includes('just now');
            return isRecent && (href.includes('/posts/') || href.includes('pfbid') || href.includes('permalink'));
          });
          if (recentLink) return recentLink.getAttribute('href');

          return null;
        });

        if (extracted) {
          postUrl = extracted.startsWith('http') ? extracted : `https://www.facebook.com${extracted}`;
        }
      } catch (e) {
        // Giữ fallback page.url()
      }

      return {
        postId: `profile_post_${Date.now()}`,
        url: postUrl,
        status: 'completed',
      };
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, 'profile_post_error');
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * 4. Đăng bài vào Hội nhóm (Facebook Group)
   */
  async publishToGroup(payload: PostPublishPayload) {
    if (!payload.groupId) {
      throw new Error('Thiếu Group ID để đăng bài vào nhóm.');
    }

    const cookies = this.parseCookies(payload.cookies);
    const browser = await this.getBrowser(payload.proxyUrl);
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Điều hướng thẳng vào nhóm
      await page.goto(`https://www.facebook.com/groups/${payload.groupId}`, {
        waitUntil: 'networkidle2',
        timeout: 35000,
      });

      await this.randomDelay(1500, 2500);

      // Đóng popup nếu có
      await page.keyboard.press('Escape');
      await this.randomDelay(500, 1000);

      // Tìm ô tạo bài viết trong nhóm: "Bạn viết gì đi...", "Write something..."
      await this.triggerComposer(page, 'group');
      await this.randomDelay(1500, 2500);

      // Nhập nội dung bài viết — dùng selector tùy biến nếu có, fallback về mặc định
      const editorSelector = resolveSelector(payload.botConfig, 'groupEditor');
      await page.waitForSelector(editorSelector, { timeout: 15000 });
      await this.typeHuman(page, editorSelector, payload.message);

      // Đính kèm file ảnh/video nếu có
      if (payload.media?.length) {
        await this.handleMediaUpload(page, payload.media, payload.botConfig);
      }

      await this.randomDelay(1000, 2000);

      // Bấm nút Đăng trong Group (sử dụng submitPostInDialog với botConfig)
      await this.submitPostInDialog(page, payload.botConfig);
      await this.randomDelay(3000, 4000);

      let postUrl = `https://www.facebook.com/groups/${payload.groupId}`;
      try {
        const extracted = await page.evaluate((gid: string) => {
          // 1. Toast link
          const toastLink = Array.from(document.querySelectorAll('a[href]')).find((a) => {
            const t = (a.textContent || '').toLowerCase();
            const href = a.getAttribute('href') || '';
            return (
              (t.includes('xem bài viết') || t.includes('view post')) &&
              (href.includes('/posts/') || href.includes('permalink'))
            );
          });
          if (toastLink) return toastLink.getAttribute('href');

          // 2. Link bài viết mới nhất có timestamp "Vừa xong"
          const recentLink = Array.from(
            document.querySelectorAll('div[role="feed"] a[href], div[role="article"] a[href]')
          ).find((a) => {
            const t = (a.textContent || '').trim().toLowerCase();
            const aria = (a.getAttribute('aria-label') || '').toLowerCase();
            const href = a.getAttribute('href') || '';
            const isRecent =
              t === 'vừa xong' ||
              t === 'just now' ||
              aria.includes('vừa xong') ||
              aria.includes('just now');
            return isRecent && href.includes(`/groups/${gid}/posts/`);
          });
          if (recentLink) return recentLink.getAttribute('href');

          return null;
        }, payload.groupId);

        if (extracted) {
          postUrl = extracted.startsWith('http') ? extracted : `https://www.facebook.com${extracted}`;
        }
      } catch (e) {
        // Giữ fallback group URL
      }

      return {
        postId: `group_${payload.groupId}_${Date.now()}`,
        url: postUrl,
        status: 'completed',
      };
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, `group_${payload.groupId}_error`);
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * 5. Tự động Đăng bình luận đầu tiên dưới bài viết (First Comment Automation)
   */
  async addCommentToPost(payload: CommentPublishPayload) {
    const cookies = this.parseCookies(payload.cookies);
    const browser = await this.getBrowser(payload.proxyUrl);
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      await page.goto(payload.postUrl, {
        waitUntil: 'networkidle2',
        timeout: 35000,
      });

      await this.randomDelay(1500, 2500);
      await page.keyboard.press('Escape');
      await this.randomDelay(500, 1000);

      const isDirectPost =
        payload.postUrl.includes('/posts/') ||
        payload.postUrl.includes('permalink') ||
        payload.postUrl.includes('story.php');

      // Nếu là URL trang tổng (Profile timeline hoặc Group feed), cuộn nhẹ để Facebook nạp bài viết
      if (!isDirectPost) {
        await page.evaluate(() => {
          window.scrollBy(0, 500);
        });
        await this.randomDelay(1500, 2500);
      }

      // Tìm và kích hoạt ô bình luận của bài viết mục tiêu
      const activated = await page.evaluate((isSinglePost: boolean) => {
        let postContainer: HTMLElement | null = null;

        if (isSinglePost) {
          postContainer =
            document.querySelector('div[role="main"]') ||
            document.querySelector('div[role="article"]') ||
            document.body;
        } else {
          // Trang feed (Profile hoặc Group): Tìm bài viết thật đầu tiên
          const articles = Array.from(
            document.querySelectorAll(
              'div[role="article"], div[role="feed"] > div, div[role="main"] div'
            )
          ) as HTMLElement[];

          postContainer =
            articles.find((el) => {
              const text = (el.innerText || '').trim();
              if (text.length < 30 || text.length > 5000) return false;

              // Loại bỏ banner quảng cáo demo của Meta trên profile
              const isDemoAd =
                text.includes('Được tài trợ (bản demo)') ||
                text.includes('Hãy thử chạy quảng cáo');
              if (isDemoAd) return false;

              // Kiểm tra xem phần tử có chứa các nút tương tác bài viết không
              const hasActions =
                text.includes('Bình luận') ||
                text.includes('Comment') ||
                text.includes('Thích') ||
                text.includes('Like');

              return hasActions;
            }) || null;
        }

        if (!postContainer) return { success: false, reason: 'post_not_found' };

        postContainer.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Kiểm tra xem ô nhập bình luận đã mở sẵn chưa
        let textbox = postContainer.querySelector(
          'div[role="textbox"][contenteditable="true"]'
        ) as HTMLElement | null;

        if (!textbox) {
          // Tìm nút "Bình luận" của bài viết này để mở hộp thoại bình luận
          const buttons = Array.from(
            postContainer.querySelectorAll('[role="button"]')
          ) as HTMLElement[];

          const commentBtn = buttons.find((b) => {
            const text = (b.textContent || '').trim().toLowerCase();
            const label = (b.getAttribute('aria-label') || '').toLowerCase();
            return (
              (text === 'bình luận' ||
                text === 'comment' ||
                label === 'bình luận' ||
                label.includes('bình luận') ||
                label.includes('comment')) &&
              !label.includes('nhãn dán') &&
              !label.includes('sticker') &&
              !label.includes('xóa') &&
              !label.includes('delete') &&
              !label.includes('gif') &&
              !label.includes('bản demo')
            );
          });

          if (commentBtn) {
            commentBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
            if (typeof commentBtn.click === 'function') {
              commentBtn.click();
            } else {
              commentBtn.dispatchEvent(
                new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
              );
            }
          }
        }

        return { success: true };
      }, isDirectPost);

      if (!activated.success) {
        throw new Error(
          `Không tìm thấy bài viết hoặc nút bình luận trên ${payload.postUrl}: ${activated.reason}`
        );
      }

      await this.randomDelay(1500, 2500);

      // Focus vào ô nhập bình luận (chính xác selector role textbox và contenteditable)
      const focused = await page.evaluate((isSinglePost: boolean) => {
        let textbox: HTMLElement | null = null;

        if (!isSinglePost) {
          const articles = Array.from(
            document.querySelectorAll(
              'div[role="article"], div[role="feed"] > div, div[role="main"] div'
            )
          ) as HTMLElement[];

          const targetPost = articles.find((el) => {
            const text = (el.innerText || '').trim();
            return (
              text.length >= 30 &&
              !text.includes('Được tài trợ (bản demo)') &&
              (text.includes('Bình luận') || text.includes('Comment'))
            );
          });

          if (targetPost) {
            textbox = targetPost.querySelector(
              'div[role="textbox"][contenteditable="true"]'
            );
          }
        }

        if (!textbox) {
          textbox = document.querySelector(
            'div[role="textbox"][contenteditable="true"][aria-label*="Bình luận"], div[role="textbox"][contenteditable="true"][aria-label*="Comment"], div[role="textbox"][contenteditable="true"][aria-placeholder*="Bình luận"], div[role="textbox"][contenteditable="true"][aria-placeholder*="Comment"]'
          );
        }

        if (textbox) {
          textbox.focus();
          return true;
        }

        const active = document.activeElement;
        if (
          active &&
          active.getAttribute('contenteditable') === 'true' &&
          active.getAttribute('role') === 'textbox'
        ) {
          return true;
        }

        return false;
      }, isDirectPost);

      if (!focused) {
        // Fallback: dùng selector tùy biến hoặc mặc định
        const fallbackSel = resolveSelector(payload.botConfig, 'commentTextbox');
        await page.waitForSelector(fallbackSel, { visible: true, timeout: 15000 });
        await page.focus(fallbackSel);
      }

      await this.randomDelay(500, 1000);

      // Gõ nội dung bình luận mô phỏng người thật
      for (const char of payload.message) {
        await page.keyboard.type(char);
        await this.randomDelay(20, 50);
      }

      await this.randomDelay(1000, 1800);

      // Nhấn Enter để gửi comment
      await page.keyboard.press('Enter');
      await this.randomDelay(2500, 3500);

      // Bấm nút Gửi (Send button / icon máy bay giấy) nếu có — dùng selector tùy biến
      const commentSubmitSel = resolveSelector(payload.botConfig, 'commentSubmitBtn');
      await page.evaluate((submitSel: string) => {
        const sendBtns = Array.from(
          document.querySelectorAll('[role="button"]')
        ) as HTMLElement[];
        const sendBtn = sendBtns.find((b) => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            label === 'bình luận' ||
            label === 'comment' ||
            label === 'gửi' ||
            label === 'send'
          );
        });
        if (sendBtn) {
          sendBtn.click();
        }
      }, commentSubmitSel);

      await this.randomDelay(2000, 3000);

      return {
        commentId: `comment_${Date.now()}`,
        url: payload.postUrl,
        status: 'completed',
      };
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, 'first_comment_error');
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * Helper: Xử lý tải và đính kèm file media (ảnh/video) vào hộp thoại bài đăng
   */
  private async handleMediaUpload(page: any, mediaList: Array<{ path: string }>, botConfig?: BotSelectorConfig) {
    if (!mediaList || mediaList.length === 0) return;

    const filePaths = await this.resolveMediaFiles(mediaList);
    if (filePaths.length === 0) {
      console.warn('[FacebookAdapter] Không tìm thấy file media hợp lệ nào trên ổ đĩa từ mediaList:', mediaList);
      return;
    }

    console.log('[FacebookAdapter] Chuẩn bị upload media, số file:', filePaths.length, filePaths);

    // Tìm input file trong dialog (Facebook đã có sẵn input ẩn trong dialog)
    let fileInput = await page.$('[role="dialog"] input[type="file"]');
    if (!fileInput) {
      const customSelector = resolveSelector(botConfig, 'mediaInput');
      fileInput = await page.$(customSelector);
    }
    if (!fileInput) {
      fileInput = await page.$('input[type="file"]');
    }

    if (fileInput) {
      console.log('[FacebookAdapter] Đang upload file:', filePaths);
      try {
        await fileInput.uploadFile(...filePaths);
        console.log('[FacebookAdapter] uploadFile() hoàn tất, chờ preview...');
        
        // Chờ preview ảnh xuất hiện (tối đa 15s)
        await page.waitForFunction(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return false;
          const imgs = Array.from(dialog.querySelectorAll('img'));
          return imgs.some(i => i.src && i.src.startsWith('blob:'));
        }, { timeout: 15000 }).catch(() => {
          console.warn('[FacebookAdapter] Hết thời gian chờ blob preview, tiếp tục...');
        });

        await this.randomDelay(2000, 3000);
      } catch (uploadErr) {
        console.error('[FacebookAdapter] Lỗi uploadFile():', uploadErr);
      }
    } else {
      console.warn('[FacebookAdapter] Không tìm thấy input file upload trong dialog');
    }
  }
}

