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
}

export interface PostPublishPayload {
  cookies: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
  groupId?: string;
  audience?: 'public' | 'friends';
}

export interface CommentPublishPayload {
  cookies: string;
  postUrl: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
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

    const browser = await this.getBrowser();
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

      // Avatar mặc định hoặc trích xuất từ DOM
      const avatarUrl = `https://graph.facebook.com/${cUser}/picture?type=large`;

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
   * 2. Lấy danh sách các Hội nhóm (Groups) mà tài khoản đã tham gia
   */
  async getJoinedGroups(rawCookies: string): Promise<FacebookGroupItem[]> {
    const cookies = this.parseCookies(rawCookies);
    const browser = await this.getBrowser();
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Trang danh sách toàn bộ các nhóm đã tham gia
      await page.goto('https://www.facebook.com/groups/joins/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await this.randomDelay(1500, 2500);

      // Cuộn trang nhẹ để kích hoạt tải dữ liệu các nhóm
      await page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await this.randomDelay(1000, 1500);

      // Trích xuất các liên kết nhóm
      const groups = await page.evaluate(() => {
        const items: Array<{ id: string; name: string; picture: string }> = [];
        const seen = new Set<string>();

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
              const text = (link as HTMLElement).innerText?.trim() || '';
              // Chỉ lấy các thẻ có tên nhóm rõ ràng
              if (text.length > 2 && !text.includes('\n')) {
                // Thử tìm ảnh thumbnail trong block nhóm
                const parentBlock = link.closest('[role="listitem"]') || link.parentElement;
                const img = parentBlock?.querySelector('img') as HTMLImageElement;
                const imgSrc = img?.src || '';

                items.push({
                  id: rawId,
                  name: text,
                  picture: imgSrc,
                });
              }
            }
          }
        }

        return items;
      });

      return groups;
    } catch (err: any) {
      if (page) {
        await this.captureErrorScreenshot(page, 'fetch_groups_failed');
      }
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.disconnect().catch(() => {});
    }
  }

  /**
   * 3. Đăng bài lên Trang cá nhân (Personal Profile)
   */
  async publishToProfile(payload: PostPublishPayload) {
    const cookies = this.parseCookies(payload.cookies);
    const browser = await this.getBrowser();
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Mở trang profile cá nhân
      await page.goto('https://www.facebook.com/me', {
        waitUntil: 'networkidle2',
        timeout: 35000,
      });

      await this.randomDelay(1500, 2500);

      // Tìm và click vào ô tạo bài viết: "Bạn đang nghĩ gì thế?"
      const composerBtn =
        '[role="button"][aria-label*="Bạn đang nghĩ gì"], [role="button"][aria-label*="What\'s on your mind"]';
      await page.waitForSelector(composerBtn, { timeout: 15000 });
      await page.click(composerBtn);

      await this.randomDelay(1000, 2000);

      // Hộp thoại tạo bài viết hiện lên
      const editorSelector = '[role="dialog"] [role="textbox"][contenteditable="true"]';
      await this.typeHuman(page, editorSelector, payload.message);

      // Đính kèm ảnh/video nếu có
      if (payload.media?.length) {
        await this.handleMediaUpload(page, payload.media);
      }

      await this.randomDelay(1000, 2000);

      // Bấm nút Đăng
      const submitBtn =
        '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]';
      await page.waitForSelector(submitBtn, { visible: true, timeout: 10000 });
      await page.click(submitBtn);

      // Chờ cho hộp thoại biến mất (đã đăng thành công)
      await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 30000 });
      await this.randomDelay(2000, 3000);

      const postUrl = page.url();
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
    const browser = await this.getBrowser();
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      // Điều hướng thẳng vào nhóm
      await page.goto(`https://www.facebook.com/groups/${payload.groupId}`, {
        waitUntil: 'networkidle2',
        timeout: 35000,
      });

      await this.randomDelay(1500, 2500);

      // Tìm ô tạo bài viết trong nhóm: "Bạn viết gì đi...", "Write something..."
      const groupComposerBtn =
        '[role="button"][aria-label*="Bạn viết gì đi"], [role="button"][aria-label*="Write something"]';
      await page.waitForSelector(groupComposerBtn, { timeout: 15000 });
      await page.click(groupComposerBtn);

      await this.randomDelay(1000, 2000);

      // Nhập nội dung bài viết
      const editorSelector = '[role="dialog"] [role="textbox"][contenteditable="true"]';
      await this.typeHuman(page, editorSelector, payload.message);

      // Đính kèm file ảnh/video nếu có
      if (payload.media?.length) {
        await this.handleMediaUpload(page, payload.media);
      }

      await this.randomDelay(1000, 2000);

      // Bấm nút Đăng
      const submitBtn =
        '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]';
      await page.waitForSelector(submitBtn, { visible: true, timeout: 10000 });
      await page.click(submitBtn);

      // Chờ đóng dialog hoặc kiểm tra thông báo chờ duyệt
      await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 30000 });
      await this.randomDelay(2000, 3000);

      return {
        postId: `group_${payload.groupId}_${Date.now()}`,
        url: `https://www.facebook.com/groups/${payload.groupId}`,
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
    const browser = await this.getBrowser();
    let page: any;

    try {
      page = await this.createStealthPage(browser, cookies);

      await page.goto(payload.postUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await this.randomDelay(1500, 2500);

      // Tìm ô viết bình luận
      const commentInputSelector =
        '[aria-label*="Viết bình luận"], [aria-label*="Write a comment"], [role="textbox"][contenteditable="true"]';
      await page.waitForSelector(commentInputSelector, { timeout: 15000 });

      // Gõ nội dung bình luận (link, hashtag, CTA)
      await this.typeHuman(page, commentInputSelector, payload.message);
      await this.randomDelay(500, 1000);

      // Nhấn Enter để gửi comment
      await page.keyboard.press('Enter');
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
  private async handleMediaUpload(page: any, mediaList: Array<{ path: string }>) {
    const filePaths: string[] = [];
    const uploadBase = process.env.UPLOAD_DIRECTORY || '/app/uploads';

    for (const m of mediaList) {
      let resolvedPath = m.path;
      // Nếu là đường dẫn tương đối hoặc URL cục bộ của Postiz
      if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('http')) {
        resolvedPath = join(uploadBase, resolvedPath);
      }
      if (existsSync(resolvedPath)) {
        filePaths.push(resolvedPath);
      }
    }

    if (filePaths.length > 0) {
      const fileInputSelector =
        '[role="dialog"] input[type="file"][accept*="image"], [role="dialog"] input[type="file"][accept*="video"]';
      const fileInput = await page.$(fileInputSelector);
      if (fileInput) {
        await fileInput.uploadFile(...filePaths);
        await this.randomDelay(3000, 5000); // Chờ render preview ảnh
      }
    }
  }
}

