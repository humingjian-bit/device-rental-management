import { renderHook, act, waitFor } from '@testing-library/react';
import { useCurrentStore, useStores, useAuth } from '@/hooks/useStore';

// Mock SWR
jest.mock('swr', () => {
  const originalModule = jest.requireActual('swr');
  return {
    ...originalModule,
    default: jest.fn((key, fetcher, options) => {
      // Store mutable state for each key
      if (!mockSWRData[key]) {
        if (typeof key === 'string' && key.includes('/api/config/stores')) {
          mockSWRData[key] = {
            stores: [
              { id: 'nantong', name: '指向-南通', default_warehouse: '南通仓' },
              { id: 'shanghai', name: '指向-上海', default_warehouse: '上海仓' },
            ],
          };
        } else if (typeof key === 'string' && key.includes('/api/auth/me')) {
          mockSWRData[key] = {
            user: { user_id: 'user1', name: 'Test User' },
          };
        } else {
          mockSWRData[key] = null;
        }
      }

      return {
        data: mockSWRData[key],
        error: null,
        isLoading: false,
        mutate: jest.fn((data) => {
          if (typeof data === 'function') {
            mockSWRData[key] = data(mockSWRData[key]);
          } else {
            mockSWRData[key] = data;
          }
          return Promise.resolve(mockSWRData[key]);
        }),
      };
    }),
  };
});

// Store mock data
const mockSWRData: Record<string, unknown> = {};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = jest.fn();

describe('useStore hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSWRData['/api/config/stores'] = {
      stores: [
        { id: 'nantong', name: '指向-南通', default_warehouse: '南通仓' },
        { id: 'shanghai', name: '指向-上海', default_warehouse: '上海仓' },
      ],
    };
    mockSWRData['/api/auth/me'] = {
      user: { user_id: 'user1', name: 'Test User' },
    };
  });

  describe('useCurrentStore', () => {
    it('should return default store id', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const { result } = renderHook(() => useCurrentStore());

      expect(result.current.storeId).toBe('nantong');
    });

    it('should read store id from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('shanghai');

      const { result } = renderHook(() => useCurrentStore());

      expect(result.current.storeId).toBe('shanghai');
    });

    it('should switch store and save to localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const { result } = renderHook(() => useCurrentStore());

      act(() => {
        result.current.switchStore('shanghai');
      });

      expect(result.current.storeId).toBe('shanghai');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('current_store', 'shanghai');
    });
  });

  describe('useStores', () => {
    it('should return stores list', async () => {
      const { result } = renderHook(() => useStores());

      await waitFor(() => {
        expect(result.current.stores).toBeDefined();
        expect(result.current.stores.length).toBeGreaterThan(0);
      });
    });

    it('should have correct store structure', async () => {
      const { result } = renderHook(() => useStores());

      await waitFor(() => {
        const store = result.current.stores[0];
        expect(store).toHaveProperty('id');
        expect(store).toHaveProperty('name');
        expect(store).toHaveProperty('default_warehouse');
      });
    });

    it('should return isLoading state', () => {
      const { result } = renderHook(() => useStores());

      expect(result.current.isLoading).toBeDefined();
    });

    it('should return error state', () => {
      const { result } = renderHook(() => useStores());

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useAuth', () => {
    it('should return user data', async () => {
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.user).toBeDefined();
        expect(result.current.user?.user_id).toBe('user1');
      });
    });

    it('should indicate authenticated state', async () => {
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it('should call logout and refresh user data', async () => {
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.user).toBeDefined();
      });

      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await act(async () => {
        await result.current.logout();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
  });
});
