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
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { FacebookAdapter, BotSelectorConfig } from './browser-bot/facebook.adapter';

/**
 * Trích xuất cấu hình BotSelectorConfig từ trường additionalSettings của Integration.
 * Trả về undefined nếu không có hoặc dữ liệu không hợp lệ.
 */
function extractBotConfig(integration: Integration): BotSelectorConfig | undefined {
  if (!integration?.additionalSettings) return undefined;
  try {
    const parsed = JSON.parse(integration.additionalSettings);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.botConfig) {
      return parsed.botConfig as BotSelectorConfig;
    }
  } catch {
    // JSON parse lỗi → bỏ qua, dùng default
  }
  return undefined;
}

export class FacebookPersonalProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'facebook-personal';
  name = 'Facebook (Profile & Groups)';
  isBetweenSteps = true; // Cho phép người dùng chọn Profile hoặc các Groups sau khi nạp cookie
  scopes = [];
  editor = 'normal' as const;
  dto = FacebookPersonalDto;
  override maxConcurrentJob = 2; // Giới hạn số lượng tác vụ đồng thời để bảo vệ tài khoản

  maxLength() {
    return 63206;
  }

  /**
   * Stub cho giao diện SocialProvider (FacebookPersonal dùng direct customFields modal, không dùng OAuth redirect)
   */
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
        label: 'Facebook Cookies (JSON hoặc chuỗi Header c_user, xs, datr, sb)',
        validation: `/^.{10,}$/`,
        type: 'password' as const,
        description:
          'Dán chuỗi cookies lấy từ tiện ích Cookie-Editor để kết nối tài khoản Facebook',
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
   * Xác thực Cookie thông qua FacebookAdapter & kiểm tra trạng thái tài khoản
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

    const adapter = new FacebookAdapter();
    const userInfo = await adapter.validateSession(cookies, proxyUrl);

    if (!userInfo?.id) {
      throw new Error(
        'Không thể xác thực cookie Facebook hoặc tài khoản đang bị checkpoint.'
      );
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

  /**
   * Trích xuất danh sách kênh con: Trang cá nhân (Profile) + Danh sách Hội nhóm (Groups)
   */
  @DashboardFunction()
  async pages(
    accessToken: string,
    _data?: any,
    _internalId?: string,
    integration?: any
  ) {
    const adapter = new FacebookAdapter();
    const cookies = adapter.parseCookies(accessToken);
    const cUser = cookies.find((c) => c.name === 'c_user')?.value || 'me';
    const proxyUrl = integration?.refreshToken || '';

    const { profilePicture, groups } = await adapter.getJoinedGroups(
      accessToken,
      proxyUrl
    );

    const finalProfilePicture =
      profilePicture ||
      integration?.picture ||
      `https://graph.facebook.com/${cUser}/picture?type=large`;

    const profileName = integration?.name
      ? integration.name.startsWith('Trang cá nhân')
        ? integration.name
        : `Trang cá nhân (${integration.name})`
      : `Trang cá nhân (ID: ${cUser})`;

    // ID duy nhất cho từng Trang cá nhân dựa trên c_user (ví dụ: profile_100002181601679)
    // Giúp lưu được nhiều Trang cá nhân khác nhau mà không bị đè internalId 'me'
    const profileId = cUser && cUser !== 'me' ? `profile_${cUser}` : 'me';

    return [
      // Kênh Trang cá nhân
      {
        id: profileId,
        name: profileName,
        picture: finalProfilePicture,
      },
      // Danh sách các Hội nhóm (đã sắp xếp nhóm Quản trị viên lên trước)
      ...groups.map((g) => ({
        id: g.id,
        name: g.isAdmin ? `[Quản trị viên] ${g.name}` : `[Thành viên] ${g.name}`,
        picture: g.picture || '',
      })),
    ];
  }

  /**
   * Lưu thông tin kênh được người dùng tích chọn vào cơ sở dữ liệu
   */
  async fetchPageInformation(
    accessToken: string,
    data: { id?: string; page?: string; name?: string; picture?: string }
  ) {
    const targetId = data.id || data.page || 'me';
    const isProfile = targetId === 'me' || targetId.startsWith('profile_');
    return {
      id: targetId, // 'profile_<c_user>' hoặc group ID
      name:
        data.name ||
        (isProfile ? 'Facebook Profile' : `FB Group ${targetId}`),
      access_token: accessToken,
      picture: data.picture || '',
      username: targetId,
    };
  }

  /**
   * Đăng bài chính lên Profile hoặc Group
   */
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const adapter = new FacebookAdapter();

    const botConfig = extractBotConfig(integration);
    const isProfile =
      integration.internalId === 'me' ||
      integration.internalId.startsWith('profile_');

    let result;
    if (isProfile) {
      // Đăng lên Trang cá nhân (Personal Profile)
      result = await adapter.publishToProfile({
        cookies: accessToken,
        message: firstPost.message,
        media: firstPost.media || [],
        proxyUrl: integration.refreshToken || '',
        botConfig,
      });
    } else {
      // Đăng vào Hội nhóm (Facebook Group)
      const groupId = integration.internalId.replace('group_', '');
      result = await adapter.publishToGroup({
        cookies: accessToken,
        groupId,
        message: firstPost.message,
        media: firstPost.media || [],
        proxyUrl: integration.refreshToken || '',
        botConfig,
      });
    }

    return [
      {
        id: firstPost.id,
        postId: result.url || result.postId,
        releaseURL:
          result.url ||
          (isProfile
            ? 'https://www.facebook.com/me'
            : `https://www.facebook.com/groups/${integration.internalId.replace('group_', '')}`),
        status: result.status,
      },
    ];
  }

  /**
   * Tự động đăng bình luận đầu tiên dưới bài viết (First Comment / Link dưới bình luận)
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
    const adapter = new FacebookAdapter();
    const botConfig = extractBotConfig(integration);

    const isProfile =
      integration.internalId === 'me' ||
      integration.internalId.startsWith('profile_');

    const targetUrl =
      postId.startsWith('http')
        ? postId
        : isProfile
        ? 'https://www.facebook.com/me'
        : `https://www.facebook.com/groups/${integration.internalId.replace('group_', '')}`;

    const result = await adapter.addCommentToPost({
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

