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

export interface PostPublishPayload {
  cookies: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
  groupId?: string;
  audience?: 'public' | 'friends';
  proxyUrl?: string;
}

export interface CommentPublishPayload {
  cookies: string;
  postUrl: string;
  message: string;
  media?: Array<{ path: string; type?: string }>;
  proxyUrl?: string;
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
    const browser = await this.getBrowser(payload.proxyUrl);
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

