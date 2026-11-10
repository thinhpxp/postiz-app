'use client';

import { withContinueProvider } from '../with-continue-provider';

interface FacebookPersonalItem {
  id: string;
  name: string;
  picture: string;
}

interface FacebookPersonalSelection {
  id: string;
  name: string;
  picture: string;
}

export const FacebookPersonalContinue = withContinueProvider<
  FacebookPersonalItem,
  FacebookPersonalSelection
>({
  endpoint: 'pages',
  swrKey: 'load-facebook-personal-pages',
  titleKey: 'select_facebook_personal_channel',
  titleDefault: 'Chọn Trang cá nhân hoặc Nhóm muốn kết nối:',
  emptyStateMessages: [
    {
      key: 'facebook_personal_no_pages_found',
      text: 'Không tìm thấy trang cá nhân hoặc nhóm nào.',
    },
  ],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({
    id: item.id,
    name: item.name,
    picture: item.picture,
  }),
  transformSaveData: (selection) => ({
    id: selection.id,
    page: selection.id,
    name: selection.name,
    picture: selection.picture,
  }),
  isSelected: (item, selection) => selection?.id === item.id,
  renderItem: (item) => {
    let roleBadge = null;
    let displayName = item.name;

    if (item.name?.startsWith('[Quản trị viên]')) {
      roleBadge = (
        <span className="inline-block text-[10px] px-[6px] py-[1px] rounded bg-[#612BD3]/40 text-[#c4b5fd] border border-[#612BD3]/60 font-medium tracking-wide">
          Quản trị viên
        </span>
      );
      displayName = item.name.replace('[Quản trị viên]', '').trim();
    } else if (item.name?.startsWith('[Thành viên]')) {
      roleBadge = (
        <span className="inline-block text-[10px] px-[6px] py-[1px] rounded bg-white/10 text-gray-300 border border-white/15 font-medium tracking-wide">
          Thành viên
        </span>
      );
      displayName = item.name.replace('[Thành viên]', '').trim();
    } else if (item.name?.startsWith('Trang cá nhân')) {
      roleBadge = (
        <span className="inline-block text-[10px] px-[6px] py-[1px] rounded bg-blue-500/25 text-blue-300 border border-blue-500/40 font-medium tracking-wide">
          Trang cá nhân
        </span>
      );
    }

    return (
      <div className="flex flex-col items-center gap-[8px] w-full">
        <div className="w-[52px] h-[52px] rounded-full overflow-hidden bg-[#181818] flex items-center justify-center border-2 border-white/20 shadow">
          {item.picture ? (
            <img
              className="w-full h-full object-cover"
              src={item.picture}
              alt={displayName}
            />
          ) : (
            <span className="text-white text-xs font-bold">
              {displayName?.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {roleBadge}

        <div className="text-white font-medium text-[13px] line-clamp-2 px-[4px] leading-[1.3] break-words">
          {displayName}
        </div>
      </div>
    );
  },
});

