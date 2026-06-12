import { loadConfig, getStoreConfig, getTableId } from '@/lib/config';

describe('config module', () => {
  describe('loadConfig', () => {
    it('should return the app configuration', () => {
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.app_id).toBe('cli_a90ec606a4b85bd3');
      expect(config.stores).toBeDefined();
      expect(Array.isArray(config.stores)).toBe(true);
      expect(config.roles).toBeDefined();
    });

    it('should have correct stores structure', () => {
      const config = loadConfig();

      expect(config.stores.length).toBeGreaterThan(0);
      
      const nantongStore = config.stores[0];
      expect(nantongStore.id).toBe('nantong');
      expect(nantongStore.name).toBe('指向-南通');
      expect(nantongStore.base_token).toBeDefined();
      expect(nantongStore.tables).toBeDefined();
      expect(nantongStore.tables.device).toBeDefined();
      expect(nantongStore.tables.inventory).toBeDefined();
      expect(nantongStore.tables.order).toBeDefined();
      expect(nantongStore.tables.repair).toBeDefined();
    });

    it('should have correct roles structure', () => {
      const config = loadConfig();

      expect(config.roles.admin).toContain('manage_permissions');
      expect(config.roles.operator).toContain('view_all');
    });
  });

  describe('getStoreConfig', () => {
    it('should return store config for valid store id', () => {
      const store = getStoreConfig('nantong');

      expect(store).toBeDefined();
      expect(store?.id).toBe('nantong');
      expect(store?.name).toBe('指向-南通');
    });

    it('should return undefined for invalid store id', () => {
      const store = getStoreConfig('invalid-store');

      expect(store).toBeUndefined();
    });

    it('should return undefined for empty store id', () => {
      const store = getStoreConfig('');

      expect(store).toBeUndefined();
    });
  });

  describe('getTableId', () => {
    it('should return table id for valid store and table name', () => {
      const tableId = getTableId('nantong', 'device');

      expect(tableId).toBeDefined();
      expect(typeof tableId).toBe('string');
      expect(tableId).toBe('tblVxflMiJ59wI51');
    });

    it('should return table id for inventory table', () => {
      const tableId = getTableId('nantong', 'inventory');

      expect(tableId).toBe('tbl5PockypnrZmJw');
    });

    it('should return table id for order table', () => {
      const tableId = getTableId('nantong', 'order');

      expect(tableId).toBe('tbllVh1wZWnzq7Uw');
    });

    it('should return table id for repair table', () => {
      const tableId = getTableId('nantong', 'repair');

      expect(tableId).toBe('tblbWVjbeXtJiNAp');
    });

    it('should return undefined for invalid store', () => {
      const tableId = getTableId('invalid-store', 'device');

      expect(tableId).toBeUndefined();
    });

    it('should return undefined for invalid table name', () => {
      const tableId = getTableId('nantong', 'invalid-table' as keyof typeof getStoreConfig('nantong') extends undefined ? never : NonNullable<ReturnType<typeof getStoreConfig>>['tables']);

      expect(tableId).toBeUndefined();
    });
  });
});
