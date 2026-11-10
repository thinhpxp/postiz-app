# Phase 3: Tích hợp Provider NestJS Hợp nhất (`FacebookPersonalProvider`)

> **Mục tiêu:** Xây dựng `FacebookPersonalProvider` đại diện cho tài khoản Facebook cá nhân. Chỉ với 1 lần nhập Cookie, người dùng có thể chọn thêm cả **Trang cá nhân (Profile)** và **Các Hội nhóm (Groups)** thành các Channel độc lập trong Postiz.

---

## 1. Tạo DTO Cài đặt Bài viết (`facebook.personal.dto.ts`)

Tạo file:
[`libraries/nestjs-libraries/src/dtos/posts/providers-settings/facebook.personal.dto.ts`](file:///home/thinhpxp/Documents/postiz-app/libraries/nestjs-libraries/src/dtos/posts/providers-settings/facebook.personal.dto.ts)

```typescript
import { IsOptional, IsString } from 'class-validator';

export class FacebookPersonalDto {
  @IsOptional()
  @IsString()
  audience?: 'public' | 'friends'; // Phạm vi hiển thị bài viết (chỉ áp dụng cho Profile)
}
```

---

## 2. Triển khai `FacebookPersonalProvider`

Tạo file:
[`libraries/nestjs-libraries/src/integrations/social/facebook.personal.provider.ts`](file:///home/thinhpxp/Documents/postiz-app/libraries/nestjs-libraries/src/integrations/social/facebook.personal.provider.ts)

### 2.1. Khai báo Cơ bản
```typescript
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import { Integration } from '@prisma/client';
import { FacebookPersonalDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.personal.dto';
import { FacebookAdapter } from './browser-bot/facebook.adapter';

export class FacebookPersonalProvider extends SocialAbstract implements SocialProvider {
  identifier = 'facebook-personal';
  name = 'Facebook (Cá nhân & Nhóm)';
  isBetweenSteps = true; // Kích hoạt popup chọn Trang cá nhân hoặc Nhóm
  scopes = [];
  editor = 'normal' as const;
  dto = FacebookPersonalDto;

  maxLength() {
    return 63206;
  }
```

### 2.2. Nhập Cookie qua Modal UI (`customFields`)
```typescript
  async customFields() {
    return [
      {
        key: 'cookies',
        label: 'Facebook Cookies (JSON hoặc chuỗi Header c_user, xs, datr, sb)',
        validation: `/^.{10,}$/`,
        type: 'password' as const,
        description: 'Dán chuỗi cookies lấy từ tiện ích Cookie-Editor để kết nối tài khoản Facebook',
      },
      {
        key: 'proxyUrl',
        label: 'Proxy riêng (Tùy chọn)',
        validation: `//`,
        type: 'text' as const,
        description: 'Ví dụ: http://user:pass@ip:port nếu muốn dùng IP dân cư cố định',
      },
    ];
  }
```

### 2.3. Xác thực & Lưu thông tin (`authenticate`)
```typescript
  async authenticate(params: { code: string; codeVerifier: string }) {
    const rawData = Buffer.from(params.code, 'base64').toString('utf-8');
    const { cookies, proxyUrl } = JSON.parse(rawData);

    const adapter = new FacebookAdapter();
    const userInfo = await adapter.validateSession(cookies, proxyUrl);

    if (!userInfo?.id) {
      throw new Error('Cookie Facebook không hợp lệ hoặc tài khoản đang bị checkpoint.');
    }

    return {
      id: userInfo.id,
      name: userInfo.name,
      accessToken: cookies,
      refreshToken: proxyUrl || '',
      expiresIn: 60 * 24 * 60 * 60, // 60 ngày
      picture: userInfo.picture,
      username: userInfo.id,
    };
  }
```

### 2.4. Danh sách Kênh Lựa chọn (`pages` & `fetchPageInformation`)
Đây là điểm sáng tạo của kiến trúc: trả về cả **Trang cá nhân** và **Danh sách Groups** trong một giao diện duy nhất:

```typescript
  @DashboardFunction()
  async pages(accessToken: string) {
    const adapter = new FacebookAdapter();
    
    // 1. Lấy thông tin user hiện tại
    const user = await adapter.validateSession(accessToken);
    
    // 2. Lấy danh sách nhóm đã tham gia
    const groups = await adapter.getJoinedGroups(accessToken);

    return [
      // Kênh Trang cá nhân
      {
        id: 'me',
        name: `Trang cá nhân (${user.name})`,
        picture: user.picture,
      },
      // Các kênh Hội nhóm
      ...groups.map((g) => ({
        id: g.id,
        name: `[Nhóm] ${g.name}`,
        picture: g.picture,
      })),
    ];
  }

  async fetchPageInformation(accessToken: string, data: { id: string; name?: string; picture?: string }) {
    return {
      id: data.id, // 'me' hoặc group ID
      name: data.name || (data.id === 'me' ? 'Facebook Profile' : `FB Group ${data.id}`),
      access_token: accessToken,
      picture: data.picture || '',
      username: data.id,
    };
  }
```

### 2.5. Xử lý Đăng bài Linh hoạt (`post`)
```typescript
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const adapter = new FacebookAdapter();

    let result;
    if (integration.internalId === 'me') {
      // Đăng lên Trang cá nhân (Personal Profile)
      result = await adapter.publishToProfile({
        cookies: accessToken,
        message: firstPost.message,
        media: firstPost.media || [],
      });
    } else {
      // Đăng vào Hội nhóm (Facebook Group)
      result = await adapter.publishToGroup({
        cookies: accessToken,
        groupId: integration.internalId,
        message: firstPost.message,
        media: firstPost.media || [],
      });
    }

    return [
      {
        id: firstPost.id,
        postId: result.postId,
        releaseURL: result.url || 'https://www.facebook.com',
        status: result.status, // 'completed' hoặc 'pending'
      },
    ];
  }

  // 2.6. Triển khai tính năng Tự động Bình luận Đầu tiên (First Comment)
  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FacebookPersonalDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const adapter = new FacebookAdapter();

    // Temporal kích hoạt hàm này ngay sau khi bài viết chính đăng thành công
    const result = await adapter.addCommentToPost({
      cookies: accessToken,
      postUrl: postId, // Hoặc URL bài viết trả về từ bước post()
      message: commentPost.message,
    });

    return [
      {
        id: commentPost.id,
        postId: result.commentId,
        releaseURL: result.url || 'https://www.facebook.com',
        status: 'completed',
      },
    ];
  }
```

---

## 3. Đăng ký vào `IntegrationManager`

Thêm `new FacebookPersonalProvider()` vào `socialIntegrationList` trong file:
[`libraries/nestjs-libraries/src/integrations/integration.manager.ts`](file:///home/thinhpxp/Documents/postiz-app/libraries/nestjs-libraries/src/integrations/integration.manager.ts).
