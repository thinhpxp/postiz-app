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
  renderItem: (item) => (
    <>
      <div className="flex justify-center">
        <div className="w-[48px] h-[48px] rounded-full overflow-hidden bg-gray-800 flex items-center justify-center border border-white/10">
          {item.picture ? (
            <img
              className="w-full h-full object-cover"
              src={item.picture}
              alt={item.name}
            />
          ) : (
            <span className="text-white text-xs font-bold">
              {item.name?.substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <div className="text-white font-medium text-[13px] line-clamp-2 px-[4px]">
        {item.name}
      </div>
    </>
  ),
});

