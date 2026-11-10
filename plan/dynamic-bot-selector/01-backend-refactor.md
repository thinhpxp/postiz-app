# Kế hoạch chi tiết: Backend Refactor (Phase 1)

> **Tệp:** `plan/dynamic-bot-selector/01-backend-refactor.md`  
> **Mục tiêu:** Cung cấp tài liệu kỹ thuật chi tiết để AI Agent có thể triển khai toàn bộ thay đổi Backend phục vụ Dynamic Bot Selector mà không gặp bất kỳ lỗi biên dịch hay xung đột logic nào.

---

## 1. Kiến trúc dữ liệu & Thiết kế Interface

### 1.1. Cấu trúc `BotSelectorConfig`
Tạo file hoặc bổ sung vào [`facebook.adapter.ts`](file:///home/thinhpxp/Documents/postiz-app/libraries/nestjs-libraries/src/integrations/social/browser-bot/facebook.adapter.ts):

```typescript
export interface BotSelectorConfig {
  // 1. Soạn bài trên Profile cá nhân
  profileFeedBox?: string;       // Nút mở hộp thoại soạn bài trên Timeline
  profileEditor?: string;        // Khung soạn thảo văn bản
  profileSubmit?: string;        // Nút Đăng (Post)
  profileNextBtn?: string;       // Nút Tiếp (Next) nếu có màn hình chọn đối tượng

  // 2. Soạn bài trong Nhóm (Group)
  groupFeedBox?: string;         // Nút mở hộp thoại soạn bài trong Group
  groupEditor?: string;          // Khung soạn thảo văn bản
  groupSubmit?: string;          // Nút Đăng trong Group

  // 3. Tải lên Media (Ảnh/Video)
  mediaInput?: string;           // Input file upload ẩn trong dialog

  // 4. Bình luận đầu tiên (First Comment)
  commentButton?: string;        // Nút mở bình luận trên bài viết
  commentTextbox?: string;       // Ô nhập văn bản bình luận
  commentSubmitBtn?: string;     // Nút gửi bình luận
}

/**
 * Giá trị mặc định toàn hệ thống cho Facebook Selector
 */
export const DEFAULT_FACEBOOK_SELECTORS: Required<BotSelectorConfig> = {
  profileFeedBox: '[role="button"][aria-label*="Bạn đang nghĩ gì"], [role="button"][aria-label*="What\'s on your mind"]',
  profileEditor: '[role="dialog"] [role="textbox"][contenteditable="true"]',
  profileSubmit: '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]',
  profileNextBtn: '[role="dialog"] [aria-label="Tiếp"], [role="dialog"] [aria-label="Next"]',

  groupFeedBox: '[role="button"][aria-label*="Bạn viết gì đi"], [role="button"][aria-label*="Write something"]',
  groupEditor: '[role="dialog"] [role="textbox"][contenteditable="true"]',
  groupSubmit: '[role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label="Post"]',

  mediaInput: '[role="dialog"] input[type="file"][accept*="image"], [role="dialog"] input[type="file"][accept*="video"]',

  commentButton: '[role="button"][aria-label*="Bình luận"], [role="button"][aria-label*="Comment"]',
  commentTextbox: 'div[role="textbox"][contenteditable="true"][aria-label*="Bình luận"], div[role="textbox"][contenteditable="true"][aria-label*="Comment"], div[role="textbox"][contenteditable="true"]',
  commentSubmitBtn: '[role="button"][aria-label*="Bình luận"], [role="button"][aria-label*="Comment"], [role="button"][aria-label*="Gửi"], [role="button"][aria-label*="Send"]',
};

/**
 * Helper phân giải selector: Ưu tiên selector cấu hình tùy biến, nếu rỗng thì fallback về mặc định
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
```

---

## 2. Refactor các Payload trong `facebook.adapter.ts`

### 2.1. Cập nhật Interface Payload
Bổ sung trường `botConfig?: BotSelectorConfig` vào:
- `PostPublishPayload`:
  ```typescript
  export interface PostPublishPayload {
    cookies: string;
    message: string;
    media?: Array<{ path: string; type?: string }>;
    groupId?: string;
    audience?: 'public' | 'friends';
    proxyUrl?: string;
    botConfig?: BotSelectorConfig; // << Bổ sung trường này
  }
  ```
- `CommentPublishPayload`:
  ```typescript
  export interface CommentPublishPayload {
    cookies: string;
    postUrl: string;
    message: string;
    media?: Array<{ path: string; type?: string }>;
    proxyUrl?: string;
    botConfig?: BotSelectorConfig; // << Bổ sung trường này
  }
  ```

---

## 3. Chi tiết refactor các hàm trong `facebook.adapter.ts`

### 3.1. `publishToProfile(payload: PostPublishPayload)`
1. **Tìm và mở hộp thoại:**
   - Thay thế selector hardcode `[role="button"][aria-label*="Bạn đang nghĩ gì"]` bằng:
     ```typescript
     const feedBoxSelector = resolveSelector(payload.botConfig, 'profileFeedBox');
     await page.waitForSelector(feedBoxSelector, { timeout: 15000 });
     await page.click(feedBoxSelector);
     ```
2. **Khung nhập văn bản:**
   - Thay thế selector hardcode editor bằng:
     ```typescript
     const editorSelector = resolveSelector(payload.botConfig, 'profileEditor');
     await page.waitForSelector(editorSelector, { timeout: 15000 });
     await page.focus(editorSelector);
     ```
3. **Nút Tiếp (Next) nếu có dialog trung gian:**
   - Sử dụng `resolveSelector(payload.botConfig, 'profileNextBtn')`.
4. **Nút Đăng (Submit):**
   - Thay thế `[role="dialog"] [aria-label="Đăng"]` bằng:
     ```typescript
     const submitBtnSelector = resolveSelector(payload.botConfig, 'profileSubmit');
     await page.waitForSelector(submitBtnSelector, { visible: true, timeout: 10000 });
     await page.click(submitBtnSelector);
     ```

### 3.2. `publishToGroup(payload: PostPublishPayload)`
1. **Mở hộp thoại soạn bài nhóm:**
   - Thay thế selector mở bài viết bằng:
     ```typescript
     const groupFeedBoxSelector = resolveSelector(payload.botConfig, 'groupFeedBox');
     await page.waitForSelector(groupFeedBoxSelector, { timeout: 15000 });
     await page.click(groupFeedBoxSelector);
     ```
2. **Khung soạn thảo & Nút Đăng:**
   - Dùng `resolveSelector(payload.botConfig, 'groupEditor')` và `resolveSelector(payload.botConfig, 'groupSubmit')`.

### 3.3. `handleMediaUpload(page: any, mediaList: Array<{ path: string }>, botConfig?: BotSelectorConfig)`
- Cập nhật tham số truyền vào thêm `botConfig?: BotSelectorConfig`.
- Selector input file:
  ```typescript
  const fileInputSelector = resolveSelector(botConfig, 'mediaInput');
  const fileInput = await page.$(fileInputSelector);
  ```

### 3.4. `addCommentToPost(payload: CommentPublishPayload)`
1. **Click nút Bình luận của bài viết:**
   - Khi cần bung ô nhập comment:
     ```typescript
     const commentBtnSelector = resolveSelector(payload.botConfig, 'commentButton');
     // Ưu tiên click button khớp với selector này trên card bài viết
     ```
2. **Focus & Gõ văn bản:**
   - Textbox selector fallback:
     ```typescript
     const commentTextboxSelector = resolveSelector(payload.botConfig, 'commentTextbox');
     await page.waitForSelector(commentTextboxSelector, { visible: true, timeout: 15000 });
     await page.focus(commentTextboxSelector);
     ```
3. **Nút Gửi bình luận (Send button):**
   - Click nút gửi dựa trên `resolveSelector(payload.botConfig, 'commentSubmitBtn')`.

---

## 4. Tích hợp trong `facebook.personal.provider.ts`

### 4.1. Helper trích xuất `botConfig` từ `Integration`
Thêm hàm helper trong [`facebook.personal.provider.ts`](file:///home/thinhpxp/Documents/postiz-app/libraries/nestjs-libraries/src/integrations/social/facebook.personal.provider.ts):

```typescript
import { BotSelectorConfig } from './browser-bot/facebook.adapter';

function extractBotConfig(integration: Integration): BotSelectorConfig | undefined {
  if (!integration?.additionalSettings) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(integration.additionalSettings);
    // Hỗ trợ trường hợp lưu dưới dạng object { botConfig: {...} }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.botConfig) {
      return parsed.botConfig;
    }
    // Hỗ trợ trường hợp lưu trực tiếp object cấu hình
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.profileEditor) {
      return parsed as BotSelectorConfig;
    }
  } catch (e) {
    // Bỏ qua lỗi cú pháp JSON
  }
  return undefined;
}
```

### 4.2. Cập nhật lời gọi trong `post()`
```typescript
const botConfig = extractBotConfig(integration);

if (integration.internalId === 'me') {
  result = await adapter.publishToProfile({
    cookies: accessToken,
    message: firstPost.message,
    media: firstPost.media || [],
    proxyUrl: integration.refreshToken || '',
    botConfig, // << Truyền botConfig vào đây
  });
} else {
  result = await adapter.publishToGroup({
    cookies: accessToken,
    groupId: integration.internalId,
    message: firstPost.message,
    media: firstPost.media || [],
    proxyUrl: integration.refreshToken || '',
    botConfig, // << Truyền botConfig vào đây
  });
}
```

### 4.3. Cập nhật lời gọi trong `comment()`
```typescript
const botConfig = extractBotConfig(integration);

const result = await adapter.addCommentToPost({
  cookies: accessToken,
  postUrl: targetUrl,
  message: commentPost.message,
  media: commentPost.media || [],
  proxyUrl: integration.refreshToken || '',
  botConfig, // << Truyền botConfig vào đây
});
```

---

## 5. Endpoints API tại `integrations.controller.ts`

Bổ sung 2 endpoint vào [`integrations.controller.ts`](file:///home/thinhpxp/Documents/postiz-app/apps/backend/src/api/routes/integrations.controller.ts):

### 5.1. `GET /integrations/:id/bot-config`
- **Mục đích:** Trả về cấu hình hiện tại của kênh và danh sách giá trị mặc định để frontend hiển thị placeholder.
- **Triển khai:**
```typescript
  @Get('/:id/bot-config')
  async getBotConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const integration = await this._integrationService.getIntegrationById(org.id, id);
    if (!integration) {
      throw new Error('Integration not found');
    }

    let customConfig = {};
    if (integration.additionalSettings) {
      try {
        const parsed = JSON.parse(integration.additionalSettings);
        customConfig = parsed.botConfig || (Array.isArray(parsed) ? {} : parsed);
      } catch {}
    }

    return {
      custom: customConfig,
      defaults: DEFAULT_FACEBOOK_SELECTORS,
      provider: integration.providerIdentifier,
    };
  }
```

### 5.2. `PUT /integrations/:id/bot-config`
- **Mục đích:** Cập nhật hoặc lưu đè cấu hình selector cho channel.
- **Triển khai:**
```typescript
  @Put('/:id/bot-config')
  async updateBotConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { botConfig: Record<string, string> }
  ) {
    const integration = await this._integrationService.getIntegrationById(org.id, id);
    if (!integration) {
      throw new Error('Integration not found');
    }

    let existingData: any = {};
    if (integration.additionalSettings) {
      try {
        const parsed = JSON.parse(integration.additionalSettings);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existingData = parsed;
        }
      } catch {}
    }

    existingData.botConfig = body.botConfig || {};

    await this._integrationService.updateProviderSettings(
      org.id,
      id,
      JSON.stringify(existingData)
    );

    return { success: true, botConfig: existingData.botConfig };
  }
```

---

## 6. Kiểm tra & Thẩm định (Verification Commands)

Sau khi hoàn thành Phase 1, chạy các lệnh sau để đảm bảo không có lỗi:
```bash
# Kiểm tra TypeScript trong toàn bộ workspace
pnpm tsc --noEmit

# Kiểm tra build nestjs-libraries
pnpm --filter @gitroom/nestjs-libraries run build

# Kiểm tra build backend
pnpm --filter postiz-backend run build
```
Đảm bảo tất cả lệnh thoát với exit code 0 trước khi chuyển sang Phase 2.

