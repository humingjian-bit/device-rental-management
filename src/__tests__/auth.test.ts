import { getLoginUrl, getCurrentUser, setUserCookie, clearUserCookie, AuthUser } from '@/lib/auth';

// Mock cookies
const mockCookies = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => mockCookies),
}));

describe('auth module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLoginUrl', () => {
    it('should return a valid OAuth login URL', () => {
      const url = getLoginUrl();

      expect(url).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(url).toContain('app_id=cli_a90ec606a4b85bd3');
      expect(url).toContain('response_type=code');
      expect(url).toContain('state=feishu_login');
    });

    it('should include redirect_uri in URL', () => {
      const url = getLoginUrl();
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      expect(params.has('redirect_uri')).toBe(true);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user object when cookie exists', async () => {
      const mockUser: AuthUser = {
        user_id: 'user123',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        open_id: 'openid123',
      };

      mockCookies.get.mockReturnValue({ value: JSON.stringify(mockUser) });

      const user = await getCurrentUser();

      expect(user).toEqual(mockUser);
      expect(mockCookies.get).toHaveBeenCalledWith('feishu_user');
    });

    it('should return null when cookie does not exist', async () => {
      mockCookies.get.mockReturnValue(undefined);

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });

    it('should return null when cookie value is invalid JSON', async () => {
      mockCookies.get.mockReturnValue({ value: 'invalid-json' });

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });

    it('should return null when cookie value is empty string', async () => {
      mockCookies.get.mockReturnValue({ value: '' });

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe('setUserCookie', () => {
    it('should set cookie with user data', async () => {
      const mockUser: AuthUser = {
        user_id: 'user123',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.png',
        open_id: 'openid123',
      };

      await setUserCookie(mockUser);

      expect(mockCookies.set).toHaveBeenCalledWith(
        'feishu_user',
        JSON.stringify(mockUser),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        })
      );
    });

    it('should set secure cookie in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockUser: AuthUser = {
        user_id: 'user123',
        name: 'Test User',
        avatar_url: '',
        open_id: 'openid123',
      };

      await setUserCookie(mockUser);

      expect(mockCookies.set).toHaveBeenCalledWith(
        'feishu_user',
        expect.any(String),
        expect.objectContaining({
          secure: true,
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should set non-secure cookie in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const mockUser: AuthUser = {
        user_id: 'user123',
        name: 'Test User',
        avatar_url: '',
        open_id: 'openid123',
      };

      await setUserCookie(mockUser);

      expect(mockCookies.set).toHaveBeenCalledWith(
        'feishu_user',
        expect.any(String),
        expect.objectContaining({
          secure: false,
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('clearUserCookie', () => {
    it('should delete feishu_user cookie', async () => {
      await clearUserCookie();

      expect(mockCookies.delete).toHaveBeenCalledWith('feishu_user');
    });
  });
});
