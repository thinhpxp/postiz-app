import {
  Logger,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Res,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { PlatformConfigService } from '@gitroom/nestjs-libraries/database/prisma/platform-config/platform.config.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import OpenAI from 'openai';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
};

// the copilot runtime writes its own CORS headers on the response, keep them aligned with main.ts
const copilotCors = () => ({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:6274',
    ...(process.env.MAIN_URL ? [process.env.MAIN_URL] : []),
  ],
  credentials: !process.env.NOT_SECURED,
});

const getOpenAIClient = () => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
  });
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService,
    private _platformConfigService: PlatformConfigService
  ) {}

  @Get('/config')
  async getAiConfig(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    const rawKey = process.env.OPENAI_API_KEY || '';
    const hasKey = !!rawKey.trim();
    let maskedKey = '';
    if (hasKey) {
      if (rawKey.length > 8) {
        maskedKey = `${rawKey.slice(0, 4)}••••••••${rawKey.slice(-4)}`;
      } else {
        maskedKey = '••••••••';
      }
    }

    const isAdmin =
      !!user?.isSuperAdmin ||
      (organization as any)?.users?.[0]?.role === 'SUPERADMIN' ||
      (organization as any)?.users?.[0]?.role === 'ADMIN';

    return {
      isConfigured: hasKey,
      maskedKey,
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      baseUrl: process.env.OPENAI_BASE_URL || '',
      isAdmin,
    };
  }

  @Post('/config')
  async saveAiConfig(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization,
    @Body() body: { apiKey?: string; model?: string; baseUrl?: string }
  ) {
    const isAdmin =
      !!user?.isSuperAdmin ||
      (organization as any)?.users?.[0]?.role === 'SUPERADMIN' ||
      (organization as any)?.users?.[0]?.role === 'ADMIN';

    if (!isAdmin) {
      throw new HttpException(
        'Only administrators can configure AI settings',
        HttpStatus.FORBIDDEN
      );
    }

    const updatePayload: Record<string, string> = {};
    if (body.apiKey !== undefined && !body.apiKey.includes('••••')) {
      updatePayload.OPENAI_API_KEY = body.apiKey;
    }
    if (body.model !== undefined) {
      updatePayload.OPENAI_MODEL = body.model;
    }
    if (body.baseUrl !== undefined) {
      updatePayload.OPENAI_BASE_URL = body.baseUrl;
    }

    await this._platformConfigService.savePlatformConfig('openai', updatePayload);
    MastraService.clearCache();

    const rawKey = process.env.OPENAI_API_KEY || '';
    let maskedKey = '';
    if (rawKey.trim()) {
      maskedKey =
        rawKey.length > 8
          ? `${rawKey.slice(0, 4)}••••••••${rawKey.slice(-4)}`
          : '••••••••';
    }

    return {
      success: true,
      isConfigured: !!rawKey.trim(),
      maskedKey,
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      baseUrl: process.env.OPENAI_BASE_URL || '',
      isAdmin: true,
    };
  }

  @Delete('/config')
  async deleteAiConfig(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    const isAdmin =
      !!user?.isSuperAdmin ||
      (organization as any)?.users?.[0]?.role === 'SUPERADMIN' ||
      (organization as any)?.users?.[0]?.role === 'ADMIN';

    if (!isAdmin) {
      throw new HttpException(
        'Only administrators can configure AI settings',
        HttpStatus.FORBIDDEN
      );
    }

    await this._platformConfigService.deletePlatformConfig('openai');
    process.env.OPENAI_API_KEY = '';
    process.env.OPENAI_MODEL = '';
    process.env.OPENAI_BASE_URL = '';
    MastraService.clearCache();

    return {
      success: true,
      isConfigured: false,
      maskedKey: '',
      model: 'gpt-4.1',
      baseUrl: '',
      isAdmin: true,
    };
  }

  @Post('/chat')
  chatAgent(@Req() req: Request, @Res() res: Response) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return res.status(400).json({
        error: 'OPENAI_API_KEY_NOT_SET',
        message:
          'OpenAI API key is not configured. Please configure it in /agents.',
      });
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      cors: copilotCors(),
      runtime: new CopilotRuntime(),
      serviceAdapter: new OpenAIAdapter({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        openai: getOpenAIClient(),
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return res.status(400).json({
        error: 'OPENAI_API_KEY_NOT_SET',
        message:
          'OpenAI API key is not configured. Please configure it in /agents.',
      });
    }
    const mastra = await this._mastraService.mastra();
    const requestContext = new RequestContext<ChannelsContext>();
    requestContext.set(
      'integrations',
      req?.body?.body?.forwardedProps?.integrations || []
    );

    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');

    const agents = MastraAgent.getLocalAgents({
      resourceId: organization.id,
      mastra,
      requestContext: requestContext as any,
    });

    const runtime = new CopilotRuntime({
      agents,
    });

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/agent',
      cors: copilotCors(),
      runtime,
      serviceAdapter: new OpenAIAdapter({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        openai: getOpenAIClient(),
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type')
    type: 'ai_images' | 'ai_videos' | 'clipping_minutes'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    if (!process.env.OPENAI_API_KEY) {
      return { messages: [] };
    }
    try {
      const mastra = await this._mastraService.mastra();
      const memory = await mastra.getAgent('postiz').getMemory();
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    if (!process.env.OPENAI_API_KEY) {
      return { threads: [] };
    }
    try {
      const mastra = await this._mastraService.mastra();
      const memory = await mastra.getAgent('postiz').getMemory();
      const list = await memory.listThreads({
        filter: { resourceId: organization.id },
        perPage: 100000,
        page: 0,
        orderBy: { field: 'createdAt', direction: 'DESC' },
      });

      return {
        threads: list.threads.map((p) => ({
          id: p.id,
          title: p.title,
        })),
      };
    } catch (err) {
      Logger.warn(`Could not list threads: ${err}`);
      return { threads: [] };
    }
  }
}

