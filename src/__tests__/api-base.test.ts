import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/config', () => ({
  getStoreConfig: jest.fn(),
}));

jest.mock('@/lib/feishu', () => ({
  listBitableRecords: jest.fn(),
  getBitableRecord: jest.fn(),
  createBitableRecord: jest.fn(),
  updateBitableRecord: jest.fn(),
  listBitableFields: jest.fn(),
}));

import { GET, POST, PUT } from '@/app/api/base/[store]/[table]/route';
import { getStoreConfig } from '@/lib/config';
import {
  listBitableRecords,
  getBitableRecord,
  createBitableRecord,
  updateBitableRecord,
  listBitableFields,
} from '@/lib/feishu';

describe('/api/base/[store]/[table] API routes', () => {
  const mockStore = {
    id: 'nantong',
    name: '指向-南通',
    base_token: 'test_token',
    tables: {
      device: 'tbl_device',
      inventory: 'tbl_inventory',
      order: 'tbl_order',
      repair: 'tbl_repair',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getStoreConfig as jest.Mock).mockReturnValue(mockStore);
  });

  describe('GET', () => {
    it('should return records list', async () => {
      const mockData = {
        items: [{ _record_id: 'rec1', Name: 'Device 1' }],
        total: 1,
        has_more: false,
      };
      (listBitableRecords as jest.Mock).mockResolvedValue(mockData);

      const request = new NextRequest('http://localhost/api/base/nantong/device');
      const response = await GET(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(listBitableRecords).toHaveBeenCalledWith('test_token', 'tbl_device', expect.any(Object));
    });

    it('should return 404 when store not found', async () => {
      (getStoreConfig as jest.Mock).mockReturnValue(undefined);

      const request = new NextRequest('http://localhost/api/base/invalid/device');
      const response = await GET(request, { params: { store: 'invalid', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Store not found');
    });

    it('should return 404 when table not found', async () => {
      (getStoreConfig as jest.Mock).mockReturnValue({
        ...mockStore,
        tables: {},
      });

      const request = new NextRequest('http://localhost/api/base/nantong/invalid');
      const response = await GET(request, { params: { store: 'nantong', table: 'invalid' } });

      expect(response.status).toBe(404);
    });

    it('should return fields when action=fields', async () => {
      const mockFields = [{ field_id: 'f1', field_name: 'Name' }];
      (listBitableFields as jest.Mock).mockResolvedValue(mockFields);

      const request = new NextRequest('http://localhost/api/base/nantong/device?action=fields');
      const response = await GET(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.fields).toEqual(mockFields);
      expect(listBitableFields).toHaveBeenCalledWith('test_token', 'tbl_device');
    });

    it('should return single record when action=get', async () => {
      const mockRecord = { _record_id: 'rec1', Name: 'Device 1' };
      (getBitableRecord as jest.Mock).mockResolvedValue(mockRecord);

      const request = new NextRequest('http://localhost/api/base/nantong/device?action=get&id=rec1');
      const response = await GET(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.record).toEqual(mockRecord);
      expect(getBitableRecord).toHaveBeenCalledWith('test_token', 'tbl_device', 'rec1');
    });

    it('should return 400 when action=get without id', async () => {
      const request = new NextRequest('http://localhost/api/base/nantong/device?action=get');
      const response = await GET(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing record id');
    });

    it('should return 500 when listBitableRecords fails', async () => {
      (listBitableRecords as jest.Mock).mockRejectedValue(new Error('API Error'));

      const request = new NextRequest('http://localhost/api/base/nantong/device');
      const response = await GET(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch records');
    });
  });

  describe('POST', () => {
    it('should create record successfully', async () => {
      const mockRecord = { _record_id: 'newRec', Name: 'New Device' };
      (createBitableRecord as jest.Mock).mockResolvedValue(mockRecord);

      const request = new NextRequest('http://localhost/api/base/nantong/device', {
        method: 'POST',
        body: JSON.stringify({ Name: 'New Device' }),
      });
      const response = await POST(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.record).toEqual(mockRecord);
      expect(createBitableRecord).toHaveBeenCalledWith('test_token', 'tbl_device', { Name: 'New Device' });
    });

    it('should return 404 when store not found', async () => {
      (getStoreConfig as jest.Mock).mockReturnValue(undefined);

      const request = new NextRequest('http://localhost/api/base/invalid/device', {
        method: 'POST',
        body: JSON.stringify({ Name: 'Test' }),
      });
      const response = await POST(request, { params: { store: 'invalid', table: 'device' } });

      expect(response.status).toBe(404);
    });

    it('should return 500 when create fails', async () => {
      (createBitableRecord as jest.Mock).mockRejectedValue(new Error('API Error'));

      const request = new NextRequest('http://localhost/api/base/nantong/device', {
        method: 'POST',
        body: JSON.stringify({ Name: 'Test' }),
      });
      const response = await POST(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create record');
    });
  });

  describe('PUT', () => {
    it('should update record successfully', async () => {
      const mockRecord = { _record_id: 'rec1', Name: 'Updated Device' };
      (updateBitableRecord as jest.Mock).mockResolvedValue(mockRecord);

      const request = new NextRequest('http://localhost/api/base/nantong/device', {
        method: 'PUT',
        body: JSON.stringify({ record_id: 'rec1', Name: 'Updated Device' }),
      });
      const response = await PUT(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.record).toEqual(mockRecord);
      expect(updateBitableRecord).toHaveBeenCalledWith('test_token', 'tbl_device', 'rec1', { Name: 'Updated Device' });
    });

    it('should return 400 when record_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/base/nantong/device', {
        method: 'PUT',
        body: JSON.stringify({ Name: 'Updated' }),
      });
      const response = await PUT(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing record_id');
    });

    it('should return 404 when store not found', async () => {
      (getStoreConfig as jest.Mock).mockReturnValue(undefined);

      const request = new NextRequest('http://localhost/api/base/invalid/device', {
        method: 'PUT',
        body: JSON.stringify({ record_id: 'rec1', Name: 'Test' }),
      });
      const response = await PUT(request, { params: { store: 'invalid', table: 'device' } });

      expect(response.status).toBe(404);
    });

    it('should return 500 when update fails', async () => {
      (updateBitableRecord as jest.Mock).mockRejectedValue(new Error('API Error'));

      const request = new NextRequest('http://localhost/api/base/nantong/device', {
        method: 'PUT',
        body: JSON.stringify({ record_id: 'rec1', Name: 'Test' }),
      });
      const response = await PUT(request, { params: { store: 'nantong', table: 'device' } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update record');
    });
  });
});
