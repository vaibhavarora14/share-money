import { renderHook, waitFor } from '@testing-library/react-hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGroups } from '../useGroups';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWithAuth } from '../../utils/api';

jest.mock('../../contexts/AuthContext');
jest.mock('../../utils/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockFetchWithAuth = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

describe('useGroups', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    jest.clearAllMocks();
  });

  it('should fetch groups when session exists', async () => {
    const mockGroups = [
      { id: '1', name: 'Group 1', created_by: 'user1', created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: '2', name: 'Group 2', created_by: 'user1', created_at: '2024-01-02', updated_at: '2024-01-02' },
    ];

    mockUseAuth.mockReturnValue({
      session: { user: { id: 'user1' } } as any,
      loading: false,
      signOut: jest.fn(),
    });

    const mockResponse = {
      json: jest.fn().mockResolvedValue(mockGroups),
      ok: true,
      status: 200,
    } as any;

    mockFetchWithAuth.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useGroups(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockGroups);
    expect(mockFetchWithAuth).toHaveBeenCalledWith('/groups');
  });

  it('should not fetch when session is null', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      loading: false,
      signOut: jest.fn(),
    });

    const { result } = renderHook(() => useGroups(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: 'user1' } } as any,
      loading: false,
      signOut: jest.fn(),
    });

    mockFetchWithAuth.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useGroups(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
