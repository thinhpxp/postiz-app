'use client';

import { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';

const SWR_OPTIONS = {
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  revalidateOnFocus: false,
  revalidateIfStale: false,
  revalidateOnMount: true,
  revalidateOnReconnect: false,
  refreshInterval: 0,
};

export interface ContinueProviderProps {
  onSave: (data: any) => Promise<void>;
  existingId: string[];
  initialData?: any[];
  isSaving?: boolean;
}

export interface EmptyStateMessage {
  key: string;
  text: string;
}

export interface ContinueProviderConfig<TItem, TSelection> {
  endpoint: string;
  swrKey: string;
  titleKey: string;
  titleDefault: string;
  emptyStateMessages: EmptyStateMessage[];
  getSelectionValue: (item: TItem) => TSelection;
  transformSaveData: (selection: TSelection) => any;
  renderItem: (item: TItem, isSelected: boolean) => ReactNode;
  isSelected: (item: TItem, selection: TSelection | null) => boolean;
  getItemId: (item: TItem) => string;
}

export function withContinueProvider<TItem, TSelection>(
  config: ContinueProviderConfig<TItem, TSelection>
): FC<ContinueProviderProps> {
  const {
    endpoint,
    swrKey,
    titleKey,
    titleDefault,
    emptyStateMessages,
    getSelectionValue,
    transformSaveData,
    renderItem,
    isSelected,
    getItemId,
  } = config;

  return function ContinueProviderComponent(props: ContinueProviderProps) {
    const { onSave, existingId, initialData, isSaving } = props;
    const call = useCustomProviderFunction();
    const t = useT();
    const [selectedMap, setSelectedMap] = useState<Record<string, TSelection>>({});
    const [search, setSearch] = useState('');

    const loadData = useCallback(async () => {
      // Skip fetch if initial data was provided
      if (initialData) {
        return initialData;
      }
      try {
        return await call.get(endpoint);
      } catch (e) {
        // Handle error silently
      }
    }, [initialData]);

    const { data, isLoading } = useSWR(
      initialData ? null : swrKey,
      loadData,
      SWR_OPTIONS
    );

    const resolvedData = initialData || data;

    const filteredData = useMemo(() => {
      return (
        (resolvedData as TItem[])?.filter(
          (item) => !existingId.includes(getItemId(item))
        ) || []
      );
    }, [resolvedData, existingId]);

    const displayedData = useMemo(() => {
      if (!search.trim()) return filteredData;
      const term = search.trim().toLowerCase();
      return filteredData.filter((item: any) => {
        const name = (item.name || '').toLowerCase();
        const username = (item.username || '').toLowerCase();
        const accountName = (item.accountName || '').toLowerCase();
        return (
          name.includes(term) ||
          username.includes(term) ||
          accountName.includes(term)
        );
      });
    }, [filteredData, search]);

    const handleToggle = useCallback(
      (item: TItem) => () => {
        const id = getItemId(item);
        setSelectedMap((prev) => {
          const next = { ...prev };
          if (next[id]) {
            delete next[id];
          } else {
            next[id] = getSelectionValue(item);
          }
          return next;
        });
      },
      [getItemId, getSelectionValue]
    );

    const isAllSelected = useMemo(() => {
      if (!displayedData.length) return false;
      return displayedData.every((item) => !!selectedMap[getItemId(item)]);
    }, [displayedData, selectedMap, getItemId]);

    const handleToggleAll = useCallback(() => {
      if (isAllSelected) {
        setSelectedMap((prev) => {
          const next = { ...prev };
          displayedData.forEach((item) => {
            delete next[getItemId(item)];
          });
          return next;
        });
      } else {
        setSelectedMap((prev) => {
          const next = { ...prev };
          displayedData.forEach((item) => {
            next[getItemId(item)] = getSelectionValue(item);
          });
          return next;
        });
      }
    }, [isAllSelected, displayedData, getItemId, getSelectionValue]);

    const selectedCount = Object.keys(selectedMap).length;

    const handleSave = useCallback(async () => {
      const selectedValues = Object.values(selectedMap);
      if (selectedValues.length === 0) return;

      if (selectedValues.length === 1) {
        const singleData = transformSaveData(selectedValues[0]);
        await onSave({
          ...singleData,
          items: [singleData],
        });
      } else {
        const items = selectedValues.map((sel) => transformSaveData(sel));
        await onSave({
          ...items[0],
          items,
        });
      }
    }, [onSave, selectedMap, transformSaveData]);

    if (!isLoading && !resolvedData?.length) {
      return (
        <div className="text-center flex flex-col justify-center items-center text-[18px] leading-[26px] h-[300px]">
          {emptyStateMessages.map((msg, index) => (
            <span key={msg.key}>
              {t(msg.key, msg.text)}
              {index < emptyStateMessages.length - 1 && (
                <>
                  <br />
                  <br />
                </>
              )}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[16px]">
        {/* Header with Title and Selected Counter */}
        <div className="flex items-center justify-between gap-[10px] flex-wrap">
          <div className="text-[15px] font-[600] text-textColor">
            {t(titleKey, titleDefault)}
          </div>
          {filteredData.length > 0 && (
            <div className="text-[12px] font-[500] px-[8px] py-[3px] rounded-full bg-newTextColor/5 text-textColor/70">
              {t('selected_channels_count', '{{selected}} of {{total}} selected', {
                selected: selectedCount,
                total: filteredData.length,
              })}
            </div>
          )}
        </div>

        {/* Toolbar: Search input and Select All button */}
        {filteredData.length > 2 && (
          <div className="flex items-center justify-between gap-[10px]">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_channels', 'Search by name...')}
                className="w-full h-[36px] px-[12px] text-[13px] rounded-[8px] bg-newBgColorInner border border-newColColor text-textColor outline-none focus:border-[#612BD3]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-[10px] top-[50%] -translate-y-[50%] text-textColor/50 hover:text-textColor text-[12px]"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleToggleAll}
              className="h-[36px] px-[12px] rounded-[8px] border border-newColColor text-[12px] font-[500] hover:bg-newTextColor/5 text-textColor transition-colors flex-shrink-0 cursor-pointer"
            >
              {isAllSelected
                ? t('deselect_all', 'Deselect All')
                : t('select_all', 'Select All')}
            </button>
          </div>
        )}

        {/* Grid of selectable items */}
        <div className="grid grid-cols-2 sm:grid-cols-3 max-h-[50vh] overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner select-none gap-[10px] p-[2px]">
          {displayedData.map((item) => {
            const id = getItemId(item);
            const isItemChecked = !!selectedMap[id];
            return (
              <div
                key={id}
                className={clsx(
                  'group relative flex flex-col w-full text-center gap-[10px] border p-[12px] rounded-[10px] transition-all cursor-pointer bg-newBgColorInner',
                  isItemChecked
                    ? 'border-[#612BD3] bg-[#612BD3]/10 ring-2 ring-[#612BD3]/30 shadow-sm'
                    : 'border-newTableBorder hover:border-textColor/40'
                )}
                onClick={handleToggle(item)}
              >
                {/* Top-right selection checkbox indicator */}
                <div className="absolute top-[8px] right-[8px] z-[10]">
                  {isItemChecked ? (
                    <div className="w-[20px] h-[20px] rounded-full bg-[#612BD3] text-white flex items-center justify-center shadow">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-[20px] h-[20px] rounded-full border-2 border-textColor/30 group-hover:border-textColor/60 bg-newBgColorInner transition-colors" />
                  )}
                </div>

                {renderItem(item, isItemChecked)}
              </div>
            );
          })}
        </div>

        {/* Footer with dynamic Save Button */}
        <div className="pt-[10px] border-t border-newTableBorder flex justify-end">
          <Button
            disabled={selectedCount === 0 || isSaving}
            loading={isSaving}
            onClick={handleSave}
          >
            {selectedCount <= 1
              ? t('connect_channel', 'Connect 1 Channel')
              : t('connect_multiple_channels', 'Connect {{count}} Channels', {
                  count: selectedCount,
                })}
          </Button>
        </div>
      </div>
    );
  };
}
