// Mock environment variables before importing module
process.env.FEISHU_APP_SECRET = 'test-secret';

import { getTenantAccessToken, listBitableRecords, getBitableRecord, createBitableRecord, updateBitableRecord, batchCreateBitableRecords, listBitableFields } from '@/lib/feishu';

// Mock fetch
global.fetch = jest.fn();

describe('feishu API module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module cache to clear token cache
    jest.resetModules();
    process.env.FEISHU_APP_SECRET = 'test-secret';
  });

  describe('getTenantAccessToken', () => {
    it('should return tenant access token on success', async () => {
      const mockResponse = {
        code: 0,
        tenant_access_token: 'test-token-123',
        token_type: 'Bearer',
        expire: 7200,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Re-import to get fresh module with mocked fetch
      const { getTenantAccessToken: getToken } = require('@/lib/feishu');
      const token = await getToken();

      expect(token).toBe('test-token-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'cli_a90ec606a4b85bd3',
            app_secret: 'test-secret',
          }),
        })
      );
    });

    it('should throw error when FEISHU_APP_SECRET is not set', async () => {
      delete process.env.FEISHU_APP_SECRET;

      const { getTenantAccessToken: getToken } = require('@/lib/feishu');

      await expect(getToken()).rejects.toThrow('FEISHU_APP_SECRET environment variable is not set');
    });

    it('should throw error when API returns non-zero code', async () => {
      const mockResponse = {
        code: 99991663,
        msg: 'Invalid app credentials',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { getTenantAccessToken: getToken } = require('@/lib/feishu');

      await expect(getToken()).rejects.toThrow('Failed to get tenant_access_token: Invalid app credentials');
    });
  });

  describe('listBitableRecords', () => {
    it('should return records list on success', async () => {
      const mockResponse = {
        code: 0,
        data: {
          items: [
            { record_id: 'rec1', fields: { Name: 'Device 1' } },
            { record_id: 'rec2', fields: { Name: 'Device 2' } },
          ],
          total: 2,
          has_more: false,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { listBitableRecords: listRecords } = require('@/lib/feishu');
      const result = await listRecords('appToken123', 'tableId123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].Name).toBe('Device 1');
      expect(result.items[0]._record_id).toBe('rec1');
      expect(result.total).toBe(2);
      expect(result.has_more).toBe(false);
    });

    it('should throw error when API returns non-zero code', async () => {
      const mockResponse = {
        code: 99991663,
        msg: 'Table not found',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { listBitableRecords: listRecords } = require('@/lib/feishu');

      await expect(listRecords('appToken123', 'invalidTable')).rejects.toThrow('Failed to list records: Table not found');
    });

    it('should handle pagination parameters', async () => {
      const mockResponse = {
        code: 0,
        data: {
          items: [],
          total: 0,
          has_more: false,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { listBitableRecords: listRecords } = require('@/lib/feishu');
      await listRecords('appToken123', 'tableId123', { page_size: 50, page_token: 'nextPage' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page_size=50'),
        expect.any(Object)
      );
    });
  });

  describe('getBitableRecord', () => {
    it('should return single record on success', async () => {
      const mockResponse = {
        code: 0,
        data: {
          record: {
            record_id: 'rec123',
            fields: { Name: 'Test Device', Status: 'Active' },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { getBitableRecord: getRecord } = require('@/lib/feishu');
      const result = await getRecord('appToken123', 'tableId123', 'rec123');

      expect(result.Name).toBe('Test Device');
      expect(result.Status).toBe('Active');
      expect(result._record_id).toBe('rec123');
    });

    it('should throw error when record not found', async () => {
      const mockResponse = {
        code: 99991663,
        msg: 'Record not found',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { getBitableRecord: getRecord } = require('@/lib/feishu');

      await expect(getRecord('appToken123', 'tableId123', 'invalidRec')).rejects.toThrow('Failed to get record: Record not found');
    });
  });

  describe('createBitableRecord', () => {
    it('should create record and return result', async () => {
      const mockResponse = {
        code: 0,
        data: {
          record: {
            record_id: 'newRec123',
            fields: { Name: 'New Device' },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { createBitableRecord: createRecord } = require('@/lib/feishu');
      const result = await createRecord('appToken123', 'tableId123', { Name: 'New Device' });

      expect(result._record_id).toBe('newRec123');
      expect(result.Name).toBe('New Device');
    });

    it('should throw error when create fails', async () => {
      const mockResponse = {
        code: 99991663,
        msg: 'Permission denied',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { createBitableRecord: createRecord } = require('@/lib/feishu');

      await expect(createRecord('appToken123', 'tableId123', {})).rejects.toThrow('Failed to create record: Permission denied');
    });
  });

  describe('updateBitableRecord', () => {
    it('should update record and return result', async () => {
      const mockResponse = {
        code: 0,
        data: {
          record: {
            record_id: 'rec123',
            fields: { Name: 'Updated Device' },
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { updateBitableRecord: updateRecord } = require('@/lib/feishu');
      const result = await updateRecord('appToken123', 'tableId123', 'rec123', { Name: 'Updated Device' });

      expect(result._record_id).toBe('rec123');
      expect(result.Name).toBe('Updated Device');
    });
  });

  describe('batchCreateBitableRecords', () => {
    it('should batch create records', async () => {
      const mockResponse = {
        code: 0,
        data: {
          records: [
            { record_id: 'rec1', fields: { Name: 'Device 1' } },
            { record_id: 'rec2', fields: { Name: 'Device 2' } },
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { batchCreateBitableRecords: batchCreate } = require('@/lib/feishu');
      const result = await batchCreate('appToken123', 'tableId123', [
        { fields: { Name: 'Device 1' } },
        { fields: { Name: 'Device 2' } },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]._record_id).toBe('rec1');
      expect(result[1]._record_id).toBe('rec2');
    });
  });

  describe('listBitableFields', () => {
    it('should return fields list on success', async () => {
      const mockResponse = {
        code: 0,
        data: {
          items: [
            { field_id: 'f1', field_name: 'Name', type: 1 },
            { field_id: 'f2', field_name: 'Status', type: 3 },
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { listBitableFields: listFields } = require('@/lib/feishu');
      const result = await listFields('appToken123', 'tableId123');

      expect(result).toHaveLength(2);
      expect(result[0].field_name).toBe('Name');
    });
  });
});
