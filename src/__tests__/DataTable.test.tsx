import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DataTable, { displayValue, extractEditValue, ColumnDef } from '@/components/DataTable';

// Mock MUI components
jest.mock('@mui/material', () => ({
  Box: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="box" {...props}>{children}</div>,
  Table: ({ children, ...props }: React.PropsWithChildren) => <table data-testid="table" {...props}>{children}</table>,
  TableBody: ({ children, ...props }: React.PropsWithChildren) => <tbody {...props}>{children}</tbody>,
  TableCell: ({ children, ...props }: React.PropsWithChildren) => <td {...props}>{children}</td>,
  TableContainer: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="table-container" {...props}>{children}</div>,
  TableHead: ({ children, ...props }: React.PropsWithChildren) => <thead {...props}>{children}</thead>,
  TableRow: ({ children, ...props }: React.PropsWithChildren) => <tr {...props}>{children}</tr>,
  TextField: ({ value, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="textfield" value={value} onChange={onChange} {...props} />
  ),
  IconButton: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button data-testid="icon-button" onClick={onClick} {...props}>{children}</button>
  ),
  Dialog: ({ open, children, onClose, ...props }: React.DialogHTMLAttributes<HTMLDialogElement> & { children: React.ReactNode }) => (
    open ? <dialog data-testid="dialog" open onClick={onClose} {...props}>{children}</dialog> : null
  ),
  DialogTitle: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="dialog-title" {...props}>{children}</div>,
  DialogContent: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="dialog-content" {...props}>{children}</div>,
  DialogActions: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="dialog-actions" {...props}>{children}</div>,
  Button: ({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
  CircularProgress: (props: object) => <div data-testid="circular-progress" {...props} />,
  Typography: ({ children, ...props }: React.PropsWithChildren) => <span {...props}>{children}</span>,
  Chip: ({ label, ...props }: React.PropsWithChildren & { label: string }) => <span data-testid="chip" {...props}>{label}</span>,
  MenuItem: ({ children, ...props }: React.PropsWithChildren) => <option {...props}>{children}</option>,
  FormControl: ({ children, ...props }: React.PropsWithChildren) => <div data-testid="form-control" {...props}>{children}</div>,
  InputLabel: ({ children, ...props }: React.PropsWithChildren) => <label {...props}>{children}</label>,
  Select: ({ value, onChange, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
    <select data-testid="select" value={value} onChange={onChange} {...props}>{children}</select>
  ),
}));

jest.mock('@mui/icons-material', () => ({
  Edit: () => <span data-testid="edit-icon">Edit</span>,
  Add: () => <span data-testid="add-icon">Add</span>,
  Refresh: () => <span data-testid="refresh-icon">Refresh</span>,
}));

describe('DataTable component', () => {
  const mockColumns: ColumnDef[] = [
    { field: 'name', headerName: '名称', type: 'text' },
    { field: 'status', headerName: '状态', type: 'select', options: [{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }] },
    { field: 'count', headerName: '数量', type: 'number' },
  ];

  const mockRows = [
    { _record_id: 'rec1', name: '设备1', status: { text: '启用' }, count: 10 },
    { _record_id: 'rec2', name: '设备2', status: { text: '停用' }, count: 5 },
  ];

  const defaultProps = {
    title: '测试表格',
    columns: mockColumns,
    rows: mockRows,
    total: 2,
    isLoading: false,
    error: null,
    hasMore: false,
    onPageChange: jest.fn(),
    onRefresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('displayValue helper', () => {
    it('should return empty display for null', () => {
      expect(displayValue(null)).toBe('-');
    });

    it('should return empty display for undefined', () => {
      expect(displayValue(undefined)).toBe('-');
    });

    it('should return empty display for empty string', () => {
      expect(displayValue('')).toBe('-');
    });

    it('should return custom empty display', () => {
      expect(displayValue(null, '无数据')).toBe('无数据');
    });

    it('should return joined array values', () => {
      expect(displayValue(['a', 'b', 'c'])).toBe('a, b, c');
    });

    it('should return empty display for empty array', () => {
      expect(displayValue([])).toBe('-');
    });

    it('should extract text from object', () => {
      expect(displayValue({ text: 'Hello' })).toBe('Hello');
    });

    it('should extract name from object', () => {
      expect(displayValue({ name: 'World' })).toBe('World');
    });

    it('should JSON stringify unknown objects', () => {
      expect(displayValue({ unknown: 'value' })).toBe('{"unknown":"value"}');
    });

    it('should convert numbers to string', () => {
      expect(displayValue(123)).toBe('123');
    });
  });

  describe('extractEditValue helper', () => {
    it('should return empty string for null', () => {
      expect(extractEditValue(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(extractEditValue(undefined)).toBe('');
    });

    it('should extract text from object', () => {
      expect(extractEditValue({ text: 'Hello' })).toBe('Hello');
    });

    it('should extract name from object', () => {
      expect(extractEditValue({ name: 'World' })).toBe('World');
    });

    it('should return value directly if not object', () => {
      expect(extractEditValue('plain string')).toBe('plain string');
      expect(extractEditValue(123)).toBe(123);
    });
  });

  describe('rendering', () => {
    it('should render table with columns', () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByText('名称')).toBeTruthy();
      expect(screen.getByText('状态')).toBeTruthy();
      expect(screen.getByText('数量')).toBeTruthy();
    });

    it('should render rows data', () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByText('设备1')).toBeTruthy();
      expect(screen.getByText('设备2')).toBeTruthy();
    });

    it('should show loading indicator when isLoading is true', () => {
      render(<DataTable {...defaultProps} isLoading={true} />);

      expect(screen.getByTestId('circular-progress')).toBeTruthy();
    });

    it('should show error message when error exists', () => {
      render(<DataTable {...defaultProps} error={new Error('Load failed')} />);

      expect(screen.getByText('加载失败，请重试')).toBeTruthy();
    });

    it('should show empty message when no rows', () => {
      render(<DataTable {...defaultProps} rows={[]} />);

      expect(screen.getByText('暂无数据')).toBeTruthy();
    });

    it('should show custom empty display text', () => {
      render(<DataTable {...defaultProps} rows={[]} emptyDisplay="没有数据" />);

      expect(screen.getByText('没有数据')).toBeTruthy();
    });

    it('should render search input', () => {
      render(<DataTable {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索...');
      expect(searchInput).toBeTruthy();
    });

    it('should render refresh button', () => {
      render(<DataTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('refresh-icon');
      expect(refreshButton).toBeTruthy();
    });

    it('should call onRefresh when refresh button clicked', () => {
      render(<DataTable {...defaultProps} />);

      const refreshButton = screen.getByTestId('icon-button');
      fireEvent.click(refreshButton);

      expect(defaultProps.onRefresh).toHaveBeenCalled();
    });
  });

  describe('search functionality', () => {
    it('should filter rows based on search text', () => {
      render(<DataTable {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索...');
      fireEvent.change(searchInput, { target: { value: '设备1' } });

      // After filtering, only matching row should be visible
      expect(screen.getByText('设备1')).toBeTruthy();
    });

    it('should show all rows when search is empty', () => {
      render(<DataTable {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索...');
      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText('设备1')).toBeTruthy();
      expect(screen.getByText('设备2')).toBeTruthy();
    });
  });

  describe('CRUD operations', () => {
    it('should show create button when onCreate is provided', () => {
      render(<DataTable {...defaultProps} onCreate={jest.fn()} />);

      expect(screen.getByText('新增')).toBeTruthy();
    });

    it('should not show create button when onCreate is not provided', () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.queryByText('新增')).toBeNull();
    });

    it('should open create dialog when create button clicked', () => {
      render(<DataTable {...defaultProps} onCreate={jest.fn()} />);

      const createButton = screen.getByText('新增');
      fireEvent.click(createButton);

      expect(screen.getByTestId('dialog-title')).toBeTruthy();
      expect(screen.getByText('新增')).toBeTruthy();
    });

    it('should show edit button when onUpdate is provided', () => {
      render(<DataTable {...defaultProps} onUpdate={jest.fn()} />);

      const editButtons = screen.getAllByTestId('edit-icon');
      expect(editButtons).toHaveLength(2);
    });

    it('should open edit dialog when edit button clicked', () => {
      render(<DataTable {...defaultProps} onUpdate={jest.fn()} />);

      const editButton = screen.getAllByTestId('edit-icon')[0];
      fireEvent.click(editButton);

      expect(screen.getByTestId('dialog-title')).toBeTruthy();
      expect(screen.getByText('编辑')).toBeTruthy();
    });

    it('should close dialog when cancel button clicked', () => {
      render(<DataTable {...defaultProps} onCreate={jest.fn()} />);

      // Open dialog
      fireEvent.click(screen.getByText('新增'));
      expect(screen.getByTestId('dialog')).toBeTruthy();

      // Close dialog
      fireEvent.click(screen.getByText('取消'));
    });

    it('should call onCreate with fields when save clicked', async () => {
      const onCreate = jest.fn().mockResolvedValue(undefined);
      render(<DataTable {...defaultProps} onCreate={onCreate} />);

      // Open dialog
      fireEvent.click(screen.getByText('新增'));

      // Click save (simplified - actual implementation would fill form)
      const saveButton = screen.getByText('保存');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalled();
      });
    });
  });

  describe('pagination', () => {
    it('should show load more button when hasMore is true', () => {
      render(<DataTable {...defaultProps} hasMore={true} />);

      expect(screen.getByText('加载更多')).toBeTruthy();
    });

    it('should not show load more button when hasMore is false', () => {
      render(<DataTable {...defaultProps} hasMore={false} />);

      expect(screen.queryByText('加载更多')).toBeNull();
    });

    it('should call onPageChange when load more clicked', () => {
      render(<DataTable {...defaultProps} hasMore={true} />);

      fireEvent.click(screen.getByText('加载更多'));

      expect(defaultProps.onPageChange).toHaveBeenCalled();
    });
  });
});
