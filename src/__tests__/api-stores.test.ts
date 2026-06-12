// Mock dependencies
jest.mock('@/lib/config', () => ({
  loadConfig: jest.fn(),
}));

import { GET } from '@/app/api/config/stores/route';
import { loadConfig } from '@/lib/config';

describe('/api/config/stores API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return stores list without sensitive info', async () => {
      (loadConfig as jest.Mock).mockReturnValue({
        app_id: 'cli_test',
        stores: [
          {
            id: 'nantong',
            name: '指向-南通',
            base_token: 'secret_token_should_not_be_returned',
            tables: { device: 'tbl1' },
            default_warehouse: '南通仓',
            platforms: [{ name: '优品租', parser: 'youpinzu' }],
          },
        ],
        roles: { admin: ['all'] },
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stores).toBeDefined();
      expect(data.stores).toHaveLength(1);
      expect(data.stores[0].id).toBe('nantong');
      expect(data.stores[0].name).toBe('指向-南通');
      expect(data.stores[0].default_warehouse).toBe('南通仓');
      expect(data.stores[0].platforms).toEqual([{ name: '优品租', parser: 'youpinzu' }]);
      
      // Ensure sensitive info is not returned
      expect(data.stores[0].base_token).toBeUndefined();
      expect(data.stores[0].tables).toBeUndefined();
    });

    it('should return empty stores array when no stores configured', async () => {
      (loadConfig as jest.Mock).mockReturnValue({
        app_id: 'cli_test',
        stores: [],
        roles: {},
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stores).toEqual([]);
    });

    it('should handle platforms field being undefined', async () => {
      (loadConfig as jest.Mock).mockReturnValue({
        app_id: 'cli_test',
        stores: [
          {
            id: 'store1',
            name: 'Store 1',
            default_warehouse: 'Default',
          },
        ],
        roles: {},
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stores[0].platforms).toEqual([]);
    });

    it('should return 500 when loadConfig throws error', async () => {
      (loadConfig as jest.Mock).mockImplementation(() => {
        throw new Error('Config load failed');
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to load config');
    });
  });
});
