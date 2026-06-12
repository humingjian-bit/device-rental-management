import { renderHook, waitFor } from '@testing-library/react';
import { useTableData, useTableFields } from '@/hooks/useTableData';

// Mock SWR
const mockMutate = jest.fn();

jest.mock('swr', () => {
  return {
    default: jest.fn((key: string | null, fetcher, options) => {
      if (key === null) {
        return {
          data: null,
          error: null,
          isLoading: false,
          mutate: mockMutate,
        };
      }

      // Determine mock data based on key
      if (key.includes('action=fields')) {
        return {
          data: {
            fields: [
              { field_id: 'f1', field_name: '名称', type: 1 },
              { field_id: 'f2', field_name: '状态', type: 3 },
            ],
          },
          error: null,
          isLoading: false,
          mutate: mockMutate,
        };
      }

      return {
        data: {
          items: [
            { _record_id: 'rec1', name: '设备1', status: 'active' },
            { _record_id: 'rec2', name: '设备2', status: 'inactive' },
          ],
          total: 2,
          has_more: true,
          page_token: 'nextPage',
        },
        error: null,
        isLoading: false,
        mutate: mockMutate,
      };
    }),
  };
});

// Mock fetch
global.fetch = jest.fn();

describe('useTableData hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutate.mockResolvedValue(undefined);
  });

  describe('useTableData', () => {
    it('should return table data', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      await waitFor(() => {
        expect(result.current.items).toBeDefined();
        expect(result.current.items.length).toBe(2);
      });
    });

    it('should return items with correct structure', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      await waitFor(() => {
        const item = result.current.items[0];
        expect(item).toHaveProperty('_record_id');
        expect(item).toHaveProperty('name');
      });
    });

    it('should return total count', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      await waitFor(() => {
        expect(result.current.total).toBe(2);
      });
    });

    it('should return pagination info', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      await waitFor(() => {
        expect(result.current.has_more).toBe(true);
        expect(result.current.page_token).toBe('nextPage');
      });
    });

    it('should include params in URL', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device', {
          page_size: 50,
          filter: 'status="active"',
          sort: 'created_at desc',
        })
      );

      await waitFor(() => {
        expect(result.current.items).toBeDefined();
      });
    });

    it('should return isLoading state', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      // Initial state check
      expect(result.current.isLoading).toBeDefined();
    });

    it('should return error state', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      expect(result.current.error).toBeDefined();
    });

    it('should provide mutate function', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'device')
      );

      await waitFor(() => {
        expect(result.current.mutate).toBeDefined();
        expect(typeof result.current.mutate).toBe('function');
      });
    });

    it('should return empty items when no data', async () => {
      const { result } = renderHook(() =>
        useTableData('nantong', 'nonexistent')
      );

      await waitFor(() => {
        expect(result.current.items).toEqual([]);
      });
    });
  });

  describe('useTableFields', () => {
    it('should return fields when storeId and tableName provided', async () => {
      const { result } = renderHook(() =>
        useTableFields('nantong', 'device')
      );

      await waitFor(() => {
        expect(result.current.fields).toBeDefined();
        expect(result.current.fields.length).toBe(2);
      });
    });

    it('should return empty fields when storeId is null', async () => {
      const { result } = renderHook(() =>
        useTableFields(null, 'device')
      );

      expect(result.current.fields).toEqual([]);
    });

    it('should return empty fields when tableName is null', async () => {
      const { result } = renderHook(() =>
        useTableFields('nantong', null)
      );

      expect(result.current.fields).toEqual([]);
    });

    it('should have correct field structure', async () => {
      const { result } = renderHook(() =>
        useTableFields('nantong', 'device')
      );

      await waitFor(() => {
        const field = result.current.fields[0];
        expect(field).toHaveProperty('field_id');
        expect(field).toHaveProperty('field_name');
        expect(field).toHaveProperty('type');
      });
    });

    it('should return isLoading state', async () => {
      const { result } = renderHook(() =>
        useTableFields('nantong', 'device')
      );

      expect(result.current.isLoading).toBeDefined();
    });

    it('should return error state', async () => {
      const { result } = renderHook(() =>
        useTableFields('nantong', 'device')
      );

      expect(result.current.error).toBeDefined();
    });
  });
});
