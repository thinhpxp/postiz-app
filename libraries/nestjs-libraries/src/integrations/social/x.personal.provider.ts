import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration } from '@prisma/client';
import { XPersonalDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.personal.dto';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { XAdapter, XBotSelectorConfig } from './browser-bot/x.adapter';

/**
 * Trích xuất cấu hình XBotSelectorConfig từ trường additionalSettings của Integration
 */
function extractBotConfig(integration: Integration): XBotSelectorConfig | undefined {
  if (!integration?.additionalSettings) return undefined;
  try {
    const parsed = JSON.parse(integration.additionalSettings);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.botConfig) {
      return parsed.botConfig as XBotSelectorConfig;
    }
  } catch {}
  return undefined;
}

export class XPersonalProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'x-personal';
  name = 'X / Twitter (Browser Bot)';
  isBetweenSteps = false;
  scopes = [];
  editor = 'normal' as const;
  dto = XPersonalDto;
  override maxConcurrentJob = 2;

  maxLength() {
    return 280;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: refreshToken,
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  /**
   * Cấu hình các trường nhập dữ liệu trên giao diện Postiz khi người dùng bấm Add Channel
   */
  async customFields() {
    return [
      {
        key: 'cookies',
        label: 'X / Twitter Cookies (auth_token & ct0 qua JSON hoặc Header)',
        validation: `/^.{10,}$/`,
        type: 'password' as const,
        description:
          'Dán cookie lấy từ Cookie-Editor trên tab x.com (cần có auth_token và ct0)',
      },
      {
        key: 'proxyUrl',
        label: 'Proxy (Tùy chọn - HTTP/SOCKS5)',
        validation: `//`,
        type: 'text' as const,
        optional: true,
        description:
          'Ví dụ: http://user:pass@ip:port nếu muốn dùng IP dân cư cố định (Để trống nếu không dùng)',
      },
    ];
  }

  /**
   * Xác thực Cookie thông qua XAdapter & kiểm tra trạng thái tài khoản
   */
  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    const rawData = Buffer.from(params.code, 'base64').toString('utf-8');
    let cookies = '';
    let proxyUrl = '';

    try {
      const parsed = JSON.parse(rawData);
      cookies = parsed.cookies || rawData;
      proxyUrl = parsed.proxyUrl || '';
    } catch {
      cookies = rawData;
    }

    const adapter = new XAdapter();
    const userInfo = await adapter.validateSession(cookies, proxyUrl);

    if (!userInfo?.id) {
      throw new Error('Không thể lấy thông tin tài khoản X từ Cookie.');
    }

    return {
      accessToken: cookies,
      refreshToken: proxyUrl, // Lưu proxy vào refreshToken nếu có
      expiresIn: 315360000,
      id: userInfo.id,
      name: userInfo.name,
      picture: userInfo.picture,
      username: userInfo.username,
    };
  }

  /**
   * Đăng Tweet mới lên X
   */
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const adapter = new XAdapter();
    const botConfig = extractBotConfig(integration);

    const result = await adapter.publishTweet({
      cookies: accessToken,
      message: firstPost.message,
      media: firstPost.media || [],
      proxyUrl: integration.refreshToken || '',
      botConfig,
    });

    return [
      {
        id: firstPost.id,
        postId: result.postId,
        releaseURL: result.url,
        status: result.status,
      },
    ];
  }

  /**
   * Đăng Reply / Bình luận đầu tiên dưới Tweet
   */
  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const adapter = new XAdapter();
    const botConfig = extractBotConfig(integration);

    const targetUrl = postId.startsWith('http')
      ? postId
      : `https://x.com/i/status/${postId}`;

    const result = await adapter.replyToTweet({
      cookies: accessToken,
      postUrl: targetUrl,
      message: commentPost.message,
      media: commentPost.media || [],
      proxyUrl: integration.refreshToken || '',
      botConfig,
    });

    return [
      {
        id: commentPost.id,
        postId: result.commentId,
        releaseURL: result.url,
        status: result.status,
      },
    ];
  }
}

